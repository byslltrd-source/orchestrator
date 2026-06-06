import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const task = formData.get('task') as string;
    const image = formData.get('image') as File | null;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key is missing" }, { status: 401 });
    }

    let messages: any[] = [
      { 
        role: "system", 
        content: "You are Orchestrator, a helpful AI with vision. You can see and analyze images very well. Always acknowledge when you see an image." 
      }
    ];

    // Add the user's text
    if (task?.trim()) {
      messages.push({ role: "user", content: task });
    }

    // Add the image if present
    if (image) {
      const bytes = await image.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = image.type || 'image/png';

      messages.push({
        role: "user",
        content: [
          { type: "text", text: task || "Please describe this image in detail." },
          { 
            type: "image_url", 
            image_url: { url: `data:${mimeType};base64,${base64}` } 
          }
        ]
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `OpenAI Error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "No response received.";

    return NextResponse.json({ result });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to connect to AI." }, { status: 500 });
  }
}