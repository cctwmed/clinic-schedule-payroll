"use client";

import { Component, type ReactNode } from "react";
import { friendlyLiffError } from "@/lib/liff/read-api-json";

interface SubpageErrorBoundaryProps {
  children: ReactNode;
  onBack: () => void;
}

interface SubpageErrorBoundaryState {
  message: string | null;
}

export class SubpageErrorBoundary extends Component<
  SubpageErrorBoundaryProps,
  SubpageErrorBoundaryState
> {
  state: SubpageErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): SubpageErrorBoundaryState {
    return { message: friendlyLiffError(error, "此頁無法開啟") };
  }

  componentDidCatch(error: unknown) {
    console.error("[LIFF subpage]", error);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          <p className="font-semibold">無法開啟此功能</p>
          <p className="mt-2 leading-relaxed">{this.state.message}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ message: null });
              this.props.onBack();
            }}
            className="mt-4 min-h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white"
          >
            返回首頁
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
