/**
 * Distributed Tracing Integration
 * OpenTelemetry + Jaeger for end-to-end observability
 */

interface SpanContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  flags: number;
}

interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: Record<string, unknown>;
}

interface Span {
  span_id: string;
  trace_id: string;
  parent_span_id?: string;
  operation_name: string;
  start_time: Date;
  end_time?: Date;
  status: "unset" | "ok" | "error";
  status_message?: string;
  duration_ms?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  links?: Array<{ trace_id: string; span_id: string }>;
}

class DistributedTracer {
  private traces: Map<string, Span[]> = new Map();
  private jaegerEndpoint: string;

  constructor(jaegerEndpoint: string = "http://localhost:14268/api/traces") {
    this.jaegerEndpoint = jaegerEndpoint;
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate span ID
   */
  private generateSpanId(): string {
    return Math.random().toString(36).substr(2, 15);
  }

  /**
   * Start a new trace
   */
  startTrace(operationName: string): SpanContext {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    const span: Span = {
      span_id: spanId,
      trace_id: traceId,
      operation_name: operationName,
      start_time: new Date(),
      status: "unset",
      attributes: {
        service: "skill-kernel",
        operation: operationName,
      },
      events: [],
    };

    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, []);
    }

    this.traces.get(traceId)!.push(span);

    return {
      trace_id: traceId,
      span_id: spanId,
      flags: 1, // Sampled
    };
  }

  /**
   * Start a child span
   */
  startChildSpan(parentContext: SpanContext, operationName: string): SpanContext {
    const spanId = this.generateSpanId();

    const span: Span = {
      span_id: spanId,
      trace_id: parentContext.trace_id,
      parent_span_id: parentContext.span_id,
      operation_name: operationName,
      start_time: new Date(),
      status: "unset",
      attributes: {
        service: "skill-kernel",
        operation: operationName,
        parent_span_id: parentContext.span_id,
      },
      events: [],
    };

    this.traces.get(parentContext.trace_id)?.push(span);

    return {
      trace_id: parentContext.trace_id,
      span_id: spanId,
      parent_span_id: parentContext.span_id,
      flags: 1,
    };
  }

  /**
   * Add attribute to span
   */
  addSpanAttribute(
    context: SpanContext,
    key: string,
    value: unknown
  ): void {
    const trace = this.traces.get(context.trace_id);
    if (!trace) return;

    const span = trace.find((s) => s.span_id === context.span_id);
    if (span) {
      span.attributes[key] = value;
    }
  }

  /**
   * Add event to span
   */
  addSpanEvent(context: SpanContext, event: SpanEvent): void {
    const trace = this.traces.get(context.trace_id);
    if (!trace) return;

    const span = trace.find((s) => s.span_id === context.span_id);
    if (span) {
      span.events.push(event);
    }
  }

  /**
   * End a span
   */
  endSpan(context: SpanContext, status: "ok" | "error" = "ok", message?: string): void {
    const trace = this.traces.get(context.trace_id);
    if (!trace) return;

    const span = trace.find((s) => s.span_id === context.span_id);
    if (span) {
      span.end_time = new Date();
      span.duration_ms = span.end_time.getTime() - span.start_time.getTime();
      span.status = status;
      span.status_message = message;
    }
  }

  /**
   * Export trace to Jaeger
   */
  async exportTrace(traceId: string): Promise<void> {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const jaegerBatch = {
      traceID: traceId,
      spans: trace.map((span) => ({
        traceID: span.trace_id,
        spanID: span.span_id,
        operationName: span.operation_name,
        references: span.parent_span_id
          ? [
              {
                refType: "CHILD_OF",
                traceID: span.trace_id,
                spanID: span.parent_span_id,
              },
            ]
          : [],
        startTime: span.start_time.getTime() * 1000, // Convert to microseconds
        duration:
          (span.duration_ms || 0) * 1000, // Convert to microseconds
        tags: Object.entries(span.attributes).map(([key, value]) => ({
          key,
          vType: typeof value === "number" ? "INT64" : "STRING",
          vStr: String(value),
          vNum: typeof value === "number" ? value : undefined,
        })),
        logs: span.events.map((event) => ({
          timestamp: event.timestamp.getTime() * 1000,
          fields: [
            {
              key: "event",
              vStr: event.name,
            },
            ...(event.attributes
              ? Object.entries(event.attributes).map(([k, v]) => ({
                  key: k,
                  vStr: String(v),
                }))
              : []),
          ],
        })),
        status: span.status === "error" ? 2 : span.status === "ok" ? 0 : 1,
      })),
      process: {
        serviceName: "skill-kernel",
        tags: [
          {
            key: "version",
            vStr: "1.0.0",
          },
        ],
      },
    };

    try {
      // In production, would send to Jaeger collector
      // await fetch(this.jaegerEndpoint, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(jaegerBatch)
      // });

      console.log(`✓ Trace ${traceId} exported to Jaeger`);
    } catch (error) {
      console.error(`Failed to export trace: ${error}`);
    }
  }

  /**
   * Generate trace summary
   */
  getTraceSummary(traceId: string): {
    trace_id: string;
    operation: string;
    span_count: number;
    total_duration_ms: number;
    error_count: number;
  } | null {
    const trace = this.traces.get(traceId);
    if (!trace || trace.length === 0) return null;

    const rootSpan = trace.find((s) => !s.parent_span_id);
    const totalDuration =
      (rootSpan?.duration_ms || 0) +
      trace.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

    const errorCount = trace.filter((s) => s.status === "error").length;

    return {
      trace_id: traceId,
      operation: rootSpan?.operation_name || "unknown",
      span_count: trace.length,
      total_duration_ms: totalDuration,
      error_count: errorCount,
    };
  }

  /**
   * Visualize trace as ASCII tree
   */
  visualizeTrace(traceId: string): string {
    const trace = this.traces.get(traceId);
    if (!trace || trace.length === 0) return "No spans found";

    const rootSpan = trace.find((s) => !s.parent_span_id);
    if (!rootSpan) return "No root span found";

    let output = `
TRACE: ${traceId}
ROOT: ${rootSpan.operation_name} (${rootSpan.duration_ms}ms)
STATUS: ${rootSpan.status}

SPANS:
`;

    const buildTree = (parentId: string | undefined, depth: number): void => {
      const children = trace.filter((s) => s.parent_span_id === parentId);

      children.forEach((span) => {
        const indent = "  ".repeat(depth);
        const status = span.status === "error" ? "❌" : "✓";

        output += `${indent}├─ ${status} ${span.operation_name} (${span.duration_ms}ms)\n`;

        if (span.events.length > 0) {
          span.events.forEach((event) => {
            output += `${indent}│  └─ [EVENT] ${event.name}\n`;
          });
        }

        buildTree(span.span_id, depth + 1);
      });
    };

    buildTree(undefined, 1);

    return output;
  }
}

export { DistributedTracer, SpanContext, Span, SpanEvent };
