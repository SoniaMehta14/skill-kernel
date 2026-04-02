import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface TaskRequest {
  id: string;
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    const body: TaskRequest = await req.json()

    // TODO: Implement task handler
    // - Validate input
    // - Create task in tasks table
    // - Log execution start to execution_logs
    // - Execute skill logic
    // - Update task status

    return new Response(
      JSON.stringify({ success: true, task_id: body.id }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    )
  }
})
