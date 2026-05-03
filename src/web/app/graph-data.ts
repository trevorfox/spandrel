/**
 * Graph fetcher. Delegates to the configured data source.
 *
 * When no data source is set explicitly (the default static-bundle path),
 * this resolves a static data source at call time. The mount API
 * (`mountViewer`) sets a custom source for embed contexts.
 */

import type { Graph } from "../types.js";
import {
  createStaticDataSource,
  type ViewerDataSource,
} from "./data-source.js";

let activeDataSource: ViewerDataSource | null = null;

export function setDataSource(source: ViewerDataSource): void {
  activeDataSource = source;
}

export function getDataSource(): ViewerDataSource {
  if (!activeDataSource) {
    activeDataSource = createStaticDataSource();
  }
  return activeDataSource;
}

export async function fetchGraph(): Promise<Graph> {
  return getDataSource().fetchGraph();
}
