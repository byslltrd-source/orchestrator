import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const task = formData.get('task') as string;
    const imageFile = formData.get('image') as File | null;

    if (!task?.trim()) {
      return NextResponse.json({ error: "Please enter a task" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key is missing" }, { status: 401 });
    }

    const messages: any[] = [
      {
        role: "system",
        content: "You are Orchestrator with full vision capabilities. Always analyze the image when provided."
      }
    ];

    // Add user task
    messages.push({ role: "user", content: task });

    // Add image if present
    if (imageFile) {
      const bytes = await imageFile.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = imageFile.type || 'image/png';

      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Describe this image in detail and answer my question." },
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
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(err);
      return NextResponse.json({ error: "OpenAI API error" }, { status: response.status });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "No response.";

    return NextResponse.json({ result });

  } catch (error) {
    console.error("Orchestrator error:", error);
    return NextResponse.json({ error: "Server error processing request" }, { status: 500 });
  }
}