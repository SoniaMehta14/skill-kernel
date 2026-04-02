/**
 * Example: Task Orchestration with Skills
 * Demonstrates how to use the skill framework in action
 */

import {
  SupabaseClient,
  analyzeExecutionLogs,
  notifySlack,
  evaluateOutput,
  createExecutionContext,
} from "./skills/index";

/**
 * Example: RCA Workflow
 * 1. Create a task
 * 2. Analyze logs for errors
 * 3. Notify team via Slack
 * 4. Evaluate suggested action
 */
async function exampleRCAWorkflow(
  projectUrl: string,
  anonKey: string
) {
  const sb = new SupabaseClient(projectUrl, anonKey);

  try {
    // Step 1: Create a task for log analysis
    const task = await sb.createTask({
      name: "Analyze Production Errors",
      description: "RCA for spike in 500 errors",
      status: "in_progress",
      user_id: "user-123",
      metadata: {
        severity: "high",
        detected_at: new Date().toISOString(),
      },
    });

    console.log("✓ Task created:", task.id);

    // Step 2: Create execution context
    const context = createExecutionContext(task.id, sb);

    // Step 3: Run log analysis
    const analysisResult = await analyzeExecutionLogs({
      ...context,
      skill_name: "log_analyzer",
      input: { task_id: task.id, limit: 100 },
    });

    console.log("✓ Analysis complete:", analysisResult.error_pattern);

    // Step 4: Notify team
    const slackNotification = await notifySlack({
      ...context,
      skill_name: "slack_notifier",
      input: {
        channel: "#incidents",
        message: `🚨 Error Analysis: ${analysisResult.error_pattern}\n_Frequency:_ ${analysisResult.frequency}\n_Action:_ ${analysisResult.suggested_action}`,
        task_id: task.id,
        include_buttons: true,
        action_type: "error",
      },
    });

    console.log("✓ Slack notification sent");

    // Step 5: Evaluate the suggested action
    const evaluation = await evaluateOutput({
      ...context,
      skill_name: "qa_evaluator",
      input: {
        output: analysisResult.suggested_action,
        ground_truth: "Increase pool size and add retries",
        metric: "accuracy",
      },
    });

    console.log(
      `✓ Action evaluation: ${(evaluation.score * 100).toFixed(1)}% match`
    );

    // Step 6: Update task status
    await sb.updateTaskStatus(task.id, "completed");
    console.log("✓ Task completed");

    return {
      task_id: task.id,
      analysis: analysisResult,
      notification_sent: slackNotification.success,
      evaluation_score: evaluation.score,
    };
  } catch (error) {
    console.error("Workflow failed:", error);
    throw error;
  }
}

/**
 * Example: SRE on-call response
 * Demonstrates automated incident response
 */
async function exampleSREResponse(
  taskId: string,
  projectUrl: string,
  anonKey: string
) {
  const sb = new SupabaseClient(projectUrl, anonKey);
  const context = createExecutionContext(taskId, sb);

  try {
    // Get task details
    const task = await sb.getTask(taskId);
    console.log("Processing task:", task.name);

    // Fetch execution history
    const logs = await sb.getExecutionLogs(taskId, 50);
    console.log(`Found ${logs.length} execution logs`);

    // Get failed logs only
    const failedLogs = await sb.getFailedLogs(taskId);
    console.log(`${failedLogs.length} failures detected`);

    // Analyze patterns
    const analysis = await analyzeExecutionLogs({
      ...context,
      skill_name: "log_analyzer",
      input: { task_id: taskId },
    });

    return analysis;
  } catch (error) {
    console.error("SRE response failed:", error);
    throw error;
  }
}

export { exampleRCAWorkflow, exampleSREResponse };
