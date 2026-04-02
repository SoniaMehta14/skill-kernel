/**
 * Ground Truth Test Datasets for QA Evaluation
 * Provides benchmark datasets for LLM output validation
 */

interface TestDataset {
  id: string;
  name: string;
  metric: "accuracy" | "latency" | "vibe";
  test_cases: TestCase[];
  created_at: Date;
  version: string;
}

interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log Analysis Ground Truth Dataset
 */
const LOG_ANALYSIS_TESTS: TestDataset = {
  id: "dataset_log_analysis_v1",
  name: "Log Analysis Accuracy",
  metric: "accuracy",
  version: "1.0.0",
  created_at: new Date("2026-04-01"),
  test_cases: [
    {
      id: "tc_log_001",
      input: JSON.stringify([
        {
          error_message: "Connection timeout after 30s",
          frequency: 5,
        },
        {
          error_message: "Connection timeout after 30s",
          frequency: 5,
        },
        {
          error_message: "Database unavailable",
          frequency: 2,
        },
      ]),
      expected_output: JSON.stringify({
        error_pattern: "Connection timeout after 30s",
        frequency: 5,
        suggested_action: "Increase connection pool size and retry with exponential backoff",
        confidence: 0.9,
      }),
      description: "Should detect most frequent error pattern",
      metadata: { severity: "high", category: "infrastructure" },
    },
    {
      id: "tc_log_002",
      input: JSON.stringify([
        {
          error_message: "Authentication failed",
          frequency: 3,
        },
        {
          error_message: "Authorization denied",
          frequency: 3,
        },
      ]),
      expected_output: JSON.stringify({
        error_pattern: "Auth-related",
        frequency: 3,
        suggested_action: "Review credentials and permissions",
        confidence: 0.85,
      }),
      description: "Should categorize related auth errors",
      metadata: { severity: "high", category: "security" },
    },
    {
      id: "tc_log_003",
      input: JSON.stringify([]),
      expected_output: JSON.stringify({
        error_pattern: "none",
        frequency: 0,
        suggested_action: "No errors detected",
        confidence: 1.0,
      }),
      description: "Should handle empty error logs",
      metadata: { severity: "low", category: "edge_case" },
    },
  ],
};

/**
 * Output Evaluation Ground Truth Dataset
 */
const OUTPUT_EVALUATION_TESTS: TestDataset = {
  id: "dataset_output_eval_v1",
  name: "Output Evaluation Accuracy",
  metric: "accuracy",
  version: "1.0.0",
  created_at: new Date("2026-04-01"),
  test_cases: [
    {
      id: "tc_eval_001",
      input: JSON.stringify({
        output: "The database connection pool size should be increased to handle more concurrent connections",
        ground_truth: "Increase the database connection pool size",
        metric: "accuracy",
      }),
      expected_output: JSON.stringify({
        score: 0.8,
        passed: true,
        feedback: "Output contains the core recommendation with supporting detail",
      }),
      description: "Should match similar but more verbose response",
      metadata: { threshold: 0.75 },
    },
    {
      id: "tc_eval_002",
      input: JSON.stringify({
        output: "Deploy a new version of the application",
        ground_truth: "Increase database pool size",
        metric: "accuracy",
      }),
      expected_output: JSON.stringify({
        score: 0.1,
        passed: false,
        feedback: "Output does not match ground truth - different domain",
      }),
      description: "Should reject completely different recommendations",
      metadata: { threshold: 0.75 },
    },
    {
      id: "tc_eval_003",
      input: JSON.stringify({
        output: "The system is degraded but operational",
        ground_truth: "The system is degraded but operational",
        metric: "accuracy",
      }),
      expected_output: JSON.stringify({
        score: 1.0,
        passed: true,
        feedback: "Exact match",
      }),
      description: "Should give perfect score for exact matches",
      metadata: { threshold: 0.95 },
    },
  ],
};

/**
 * Latency Benchmark Dataset
 */
const LATENCY_TESTS: TestDataset = {
  id: "dataset_latency_v1",
  name: "Latency Benchmarks",
  metric: "latency",
  version: "1.0.0",
  created_at: new Date("2026-04-01"),
  test_cases: [
    {
      id: "tc_latency_001",
      input: "analyze_logs",
      expected_output: JSON.stringify({
        max_duration_ms: 5000,
        target_duration_ms: 2000,
      }),
      description: "Log analysis should complete within 5 seconds",
    },
    {
      id: "tc_latency_002",
      input: "slack_notification",
      expected_output: JSON.stringify({
        max_duration_ms: 3000,
        target_duration_ms: 1000,
      }),
      description: "Slack notification should complete within 3 seconds",
    },
    {
      id: "tc_latency_003",
      input: "output_evaluation",
      expected_output: JSON.stringify({
        max_duration_ms: 2000,
        target_duration_ms: 500,
      }),
      description: "Evaluation should complete within 2 seconds",
    },
  ],
};

/**
 * Vibe Check Dataset
 */
const VIBE_TESTS: TestDataset = {
  id: "dataset_vibe_v1",
  name: "Tone and Context Appropriateness",
  metric: "vibe",
  version: "1.0.0",
  created_at: new Date("2026-04-01"),
  test_cases: [
    {
      id: "tc_vibe_001",
      input: "incident_response",
      expected_output: JSON.stringify({
        tone: "urgent_professional",
        context_appropriate: true,
        feedback: "Urgent but professional tone is correct for incident response",
      }),
      description: "Incident response should have urgent but professional tone",
    },
    {
      id: "tc_vibe_002",
      input: "routine_status_update",
      expected_output: JSON.stringify({
        tone: "neutral_informative",
        context_appropriate: true,
        feedback: "Neutral informative tone is appropriate for routine updates",
      }),
      description: "Routine updates should maintain neutral informative tone",
    },
    {
      id: "tc_vibe_003",
      input: "error_message",
      expected_output: JSON.stringify({
        tone: "clear_actionable",
        context_appropriate: true,
        feedback: "Error messages should be clear and include actionable solutions",
      }),
      description: "Error messages should be clear and actionable",
    },
  ],
};

/**
 * Repository of all test datasets
 */
const TEST_DATASETS: TestDataset[] = [
  LOG_ANALYSIS_TESTS,
  OUTPUT_EVALUATION_TESTS,
  LATENCY_TESTS,
  VIBE_TESTS,
];

/**
 * Get test dataset by ID
 */
function getTestDataset(id: string): TestDataset | undefined {
  return TEST_DATASETS.find((ds) => ds.id === id);
}

/**
 * Get test datasets by metric
 */
function getTestDatasetsByMetric(
  metric: "accuracy" | "latency" | "vibe"
): TestDataset[] {
  return TEST_DATASETS.filter((ds) => ds.metric === metric);
}

/**
 * Generate evaluation report
 */
function generateEvaluationReport(
  testDataset: TestDataset,
  results: Array<{ test_case_id: string; passed: boolean; score: number }>
): Record<string, unknown> {
  const totalTests = testDataset.test_cases.length;
  const passedTests = results.filter((r) => r.passed).length;
  const averageScore =
    results.reduce((acc, r) => acc + r.score, 0) / results.length;

  return {
    dataset_id: testDataset.id,
    dataset_name: testDataset.name,
    metric: testDataset.metric,
    total_tests: totalTests,
    passed: passedTests,
    failed: totalTests - passedTests,
    pass_rate: (passedTests / totalTests).toFixed(2),
    average_score: averageScore.toFixed(3),
    results,
    generated_at: new Date().toISOString(),
  };
}

export {
  TestDataset,
  TestCase,
  LOG_ANALYSIS_TESTS,
  OUTPUT_EVALUATION_TESTS,
  LATENCY_TESTS,
  VIBE_TESTS,
  TEST_DATASETS,
  getTestDataset,
  getTestDatasetsByMetric,
  generateEvaluationReport,
};
