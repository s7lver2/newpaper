import type { Visualization } from '@newpaper/pipeline';
import type { ReactElement } from 'react';
import { BarChart } from './BarChart';
import { ChartFrame, type FrameSource } from './ChartFrame';
import { LineChart } from './LineChart';
import { MatrixChart } from './MatrixChart';
import { ParliamentChart, ParliamentTable, type ParliamentLabels } from './parliament/ParliamentChart';
import type { PartySeats } from './parliament/hemicycle';
import { RangeChart } from './RangeChart';
import { StackedChart } from './StackedChart';
import { TableChart } from './TableChart';
import { TileMap } from './TileMap';
import { gridFor } from './tileGrids';

export interface VizLabels {
  sources: string;
  showTable: string;
  showChart: string;
  label: string;
  value: string;
  region: string;
  matrix(c: 'si' | 'par' | 'mal' | 'no'): string;
  parliament: ParliamentLabels;
}
export interface PartyInfo { id: string; name: string; short: string; color: string; order: number }

export function VisualizationView(props: {
  viz: Visualization;
  sources: { id: string; title: string; url: string }[];
  parties?: PartyInfo[];
  labels: VizLabels;
  format(n: number): string;
  regionName(code: string): string;
  onOpenSource?(url: string): void;
}) {
  const { viz, labels, format } = props;
  const numbered: FrameSource[] = viz.sourceIds
    .map((id) => {
      const i = props.sources.findIndex((s) => s.id === id);
      return i < 0 ? null : { n: i + 1, title: props.sources[i]!.title, url: props.sources[i]!.url };
    })
    .filter((x): x is FrameSource => x !== null);
  if (!numbered.length) return null; // §6.2: sin fuente recuperada no se dibuja
  const frame = (chart: ReactElement, table: ReactElement) => (
    <ChartFrame title={viz.title} unit={viz.unit} sources={numbered} labels={labels} table={table} onOpenSource={props.onOpenSource}>
      {chart}
    </ChartFrame>
  );
  const pointsTable = (pts: { x: string; y: number }[]) => <TableChart columns={[labels.label, labels.value]} rows={pts.map((p) => [p.x, format(p.y)])} />;
  switch (viz.type) {
    case 'bar':
      return frame(<BarChart points={viz.data.points} format={format} label={viz.title} />, pointsTable(viz.data.points));
    case 'line':
      return frame(<LineChart points={viz.data.points} format={format} label={viz.title} />, pointsTable(viz.data.points));
    case 'range':
      return frame(
        <RangeChart {...viz.data} format={format} label={viz.title} />,
        <TableChart columns={[labels.label, labels.value]} rows={viz.data.ranges.map((r) => [r.label, `${format(r.from)} – ${format(r.to)}`])} />,
      );
    case 'stacked':
      return frame(
        <StackedChart {...viz.data} label={viz.title} />,
        <TableChart columns={[labels.label, ...viz.data.categories]} rows={viz.data.rows.map((r) => [r.label, ...r.values])} />,
      );
    case 'matrix':
      return frame(
        <MatrixChart {...viz.data} cellLabel={labels.matrix} label={viz.title} />,
        <TableChart columns={[labels.label, ...viz.data.columns]} rows={viz.data.rows.map((r) => [r.label, ...r.cells.map(labels.matrix)])} />,
      );
    case 'table':
      return frame(<TableChart {...viz.data} />, <TableChart {...viz.data} />);
    case 'map': {
      const table = <TableChart columns={[labels.region, labels.value]} rows={viz.data.regions.map((r) => [props.regionName(r.code), format(r.value)])} />;
      // Un código sin rejilla conocida: se pinta la tabla como vista principal (TileMap no es nulo como elemento).
      const known = gridFor(viz.data.regions.map((r) => r.code)) !== null;
      const map = <TileMap regions={viz.data.regions} format={format} label={viz.title} regionName={props.regionName} />;
      return frame(known ? map : table, table);
    }
    case 'parliament': {
      const info = new Map((props.parties ?? []).map((p) => [p.id, p]));
      const seats: PartySeats[] = viz.data.series[0]!.seats.flatMap((s) => {
        const p = info.get(s.partyId);
        return p ? [{ partyId: p.id, name: p.name, short: p.short, color: p.color, order: p.order, seats: s.seats }] : [];
      });
      if (!seats.length) return null;
      return frame(
        <ParliamentChart total={viz.data.total} majority={viz.data.majority} parties={seats} labels={labels.parliament} />,
        <ParliamentTable parties={seats} labels={labels.parliament} />,
      );
    }
  }
}
