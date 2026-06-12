import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { FREE_LIMIT, PRO_LIMIT } from '@/lib/constants';
import type { TypedServiceClient } from '@/lib/supabase/service';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Privileged service operations - loose cast (full types in lib/supabase/database.types.ts)
  const service = createServiceClient() as any;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string;

        if (userId) {
          let periodEnd: string | undefined;
          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription as string);
              if ((sub as any).current_period_end) {
                periodEnd = new Date((sub as any).current_period_end * 1000).toISOString();
              }
            } catch {}
          }

          await service
            .from('profiles')
            .update({
              stripe_customer_id: customerId,
              subscription_status: 'active',
              subscription_plan: 'pro',
              ...(periodEnd ? { current_period_end: periodEnd } : {}),
            })
            .eq('id', userId);

          // Reset usage on upgrade (generous)
          await service
            .from('profiles')
            .update({
              orchestrations_used: 0,
            })
            .eq('id', userId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        // Find user by customer id
        const { data: profile } = await service
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profile) {
          const isActive = sub.status === 'active' || sub.status === 'trialing';
          const plan = isActive ? 'pro' : 'free';

          await service
            .from('profiles')
            .update({
              subscription_status: sub.status,
              subscription_plan: plan,
              current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
            })
            .eq('id', profile.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profile } = await service
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profile) {
          await service
            .from('profiles')
            .update({
              subscription_status: 'canceled',
              subscription_plan: 'free',
              // Keep the old limit or set back to free tier
              orchestrations_limit: FREE_LIMIT,
            })
            .eq('id', profile.id);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // Can be used to reset monthly quota on renewal if desired
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as any)?.id;

        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const customerId = sub.customer as string;

          const { data: profile } = await service
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single();

          if (profile) {
            // Reset usage on successful renewal
            await service
              .from('profiles')
              .update({
                orchestrations_used: 0,
                orchestrations_limit: PRO_LIMIT, // effectively unlimited for pro
              })
              .eq('id', profile.id);
          }
        }
        break;
      }

      case 'invoice.payment_failed':
      case 'payment_intent.payment_failed': {
        // Optional: you could email the user or mark something; for now just log
        console.warn('Payment failed event received:', event.type);
        break;
      }

      // 'customer.subscription.pending' (and similar) usually surface via customer.subscription.updated with appropriate status
      default:
        // console.log(`Unhandled event type ${event.type}`);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
