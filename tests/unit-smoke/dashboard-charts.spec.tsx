// tests/unit-smoke/dashboard-charts.spec.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardCharts from "@/app/dashboard/_components/DashboardCharts";

describe("DashboardCharts", () => {
  it("renders nothing when there is no data", () => {
    const { container } = render(<DashboardCharts data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders labels for each data point", () => {
    const data = [
      { date: "2025-01-01", label: "Jan 1", listings: 1, messages: 0 },
      { date: "2025-01-02", label: "Jan 2", listings: 0, messages: 3 },
      { date: "2025-01-03", label: "Jan 3", listings: 2, messages: 1 },
    ];

    render(<DashboardCharts data={data} />);

    for (const point of data) {
      expect(screen.getByText(point.label)).toBeInTheDocument();
    }
  });

  it("shows separate legends for listings and messages", () => {
    const data = [
      { date: "2025-01-01", label: "Jan 1", listings: 1, messages: 2 },
      { date: "2025-01-02", label: "Jan 2", listings: 0, messages: 0 },
    ];

    render(<DashboardCharts data={data} />);

    expect(screen.getByText(/listings/i)).toBeInTheDocument();
    expect(screen.getByText(/messages/i)).toBeInTheDocument();
  });
});
