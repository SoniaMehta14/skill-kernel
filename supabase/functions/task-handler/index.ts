import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

interface TaskRequest {
  name: string;
  description?: string;
  skill_name: string;
  skill_input: Record<string, unknown>;
  user_id?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body: TaskRequest = await req.json();

    // Validate required fields
    if (!body.name || !body.skill_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, skill_name" }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Initialize Supabase client (service_role bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create task record
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert([
        {
          name: body.name,
          description: body.description,
          status: "in_progress",
          user_id: body.user_id,
          metadata: {
            skill_name: body.skill_name,
            skill_input: body.skill_input,
          },
        },
      ])
      .select()
      .single();

    if (taskError) {
      throw new Error(`Failed to create task: ${taskError.message}`);
    }

    // Log execution start
    await supabase.from("execution_logs").insert([
      {
        task_id: task.id,
        status: "running",
        thought_process: {
          skill: body.skill_name,
          input: body.skill_input,
          initiated_by: body.user_id || "system",
        },
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        task_id: task.id,
        status: "in_progress",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
