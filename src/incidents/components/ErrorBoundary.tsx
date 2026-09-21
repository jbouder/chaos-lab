import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportIncident } from "../bus";

type Props = { name: string; children: ReactNode };
type State = { error: Error | null; attempt: number };

/**
 * Deliberately small in scope: one panel failing should cost one panel, not
 * the page. The reset button remounts the subtree rather than reloading.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportIncident({
      kind: "render-crash",
      source: "boundary",
      title: `${this.props.name} crashed while rendering`,
      detail: error.message,
      context: {
        component: this.props.name,
        componentStack: info.componentStack?.split("\n").slice(0, 4).join("\n"),
      },
      fingerprint: `render-crash:${this.props.name}`,
    });
  }

  private reset = (): void => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  render(): ReactNode {
    const { error, attempt } = this.state;
    if (!error) return <div key={attempt}>{this.props.children}</div>;

    return (
      <div className="flex h-full min-h-[9rem] flex-col justify-between gap-4 border border-crisis/30 bg-crisis/5 p-4">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-crisis">
            <TriangleAlert className="size-3.5" aria-hidden />
            {this.props.name} stopped
          </p>
          <p className="text-sm text-foreground">
            This panel crashed while drawing. Everything else on the page kept running.
          </p>
          <p className="font-mono text-xs text-muted-foreground">{error.message}</p>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={this.reset}>
          <RotateCcw className="size-3.5" aria-hidden />
          Retry this panel
        </Button>
      </div>
    );
  }
}
