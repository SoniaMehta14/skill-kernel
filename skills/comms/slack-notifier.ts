/**
 * Slack Notifier Skill - Communications
 * Posts task status updates and escalations to Slack
 */

import {
  withExecutionLogging,
  SkillExecutionContext,
} from "../../supabase/middleware";

interface SlackNotifyInput {
  channel: string;
  message: string;
  task_id: string;
  include_buttons?: boolean;
  action_type?: "info" | "warning" | "error" | "success";
}

interface SlackResponse {
  success: boolean;
  ts?: string;
  error?: string;
  channel_id?: string;
}

/**
 * Build Slack message block
 */
function buildSlackBlock(
  input: SlackNotifyInput
): Record<string, unknown> {
  const colorMap = {
    info: "#0099ff",
    warning: "#ffaa00",
    error: "#ff0000",
    success: "#00ff00",
  };

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: input.message,
      },
    },
  ];

  if (input.include_buttons) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Task ID: \`${input.task_id}\``,
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "View Task",
        },
        url: `https://app.example.com/tasks/${input.task_id}`,
      },
    });
  }

  return {
    channel: input.channel,
    blocks,
    metadata: {
      event_type: "task_update",
      task_id: input.task_id,
    },
  };
}

/**
 * Core notification logic
 */
async function notifySlackLogic(
  input: SlackNotifyInput
): Promise<SlackResponse> {
  // In production, this would call the Slack API
  // For now, return mock response
  const slackBlock = buildSlackBlock(input);

  return {
    success: true,
    ts: `${Date.now() / 1000}`,
    channel_id: input.channel,
  };
}

/**
 * Execute Slack notification with automatic logging
 */
async function notifySlack(
  context: SkillExecutionContext & { input: SlackNotifyInput }
): Promise<SlackResponse> {
  return notifySlackLogic(context.input);
}

/**
 * Wrapped skill with execution logging
 */
const executeSlackNotify = withExecutionLogging(
  notifySlackLogic,
  "slack_notifier"
);

export { notifySlack, executeSlackNotify, SlackResponse };
