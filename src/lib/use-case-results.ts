import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchMethod } from "../core/circular-search";
import {
  createResultsInspection,
  initialResultsSelection,
  type CaseResultRecord,
  type CaseResultsView,
  type ResultSurface,
  type ResultsDetail,
  type ResultsInspectionEvent,
  type ResultsOverlay,
  type ResultsSelection,
} from "./case-results";
import { startSearchWorker } from "./circular-search-client";

const emptySelection: ResultsSelection = {
  method: null,
  candidateNumber: null,
  sliceNumber: null,
};
const idle: ResultsDetail = { status: "idle" };
type Selected = { record: CaseResultRecord; value: ResultsSelection };

/** Seleção pelo número original; trocar método não troca o círculo ou refaz fatias. */
export function useCaseResults(view: CaseResultsView) {
  const record = view.status === "current" ? view.record : null;
  const [storedSelection, setStoredSelection] = useState<Selected | null>(null);
  const [storedDetail, setStoredDetail] = useState<ResultsInspectionEvent>({
    record: null,
    detail: idle,
  });
  const selected = record
    ? storedSelection?.record === record
      ? storedSelection.value
      : initialResultsSelection(record)
    : emptySelection;
  const selectedRef = useRef({
    record,
    candidateNumber: selected.candidateNumber,
  });
  selectedRef.current = { record, candidateNumber: selected.candidateNumber };
  const inspection = useRef<ReturnType<typeof createResultsInspection> | null>(
    null,
  );

  useEffect(() => {
    const task = createResultsInspection({
      current: () => selectedRef.current,
      onChange: (event) => {
        setStoredDetail(event);
        if (event.record && event.detail.status === "ready") {
          const completedRecord = event.record;
          const candidateNumber = event.detail.candidateNumber;
          const firstSlice =
            event.detail.value.geometry.geometry?.slices[0]?.number ?? null;
          setStoredSelection((before) => {
            const previous =
              before?.record === completedRecord
                ? before.value
                : initialResultsSelection(completedRecord);
            return previous.candidateNumber === candidateNumber
              ? {
                  record: completedRecord,
                  value: { ...previous, sliceNumber: firstSlice },
                }
              : before;
          });
        }
      },
      startWorker: startSearchWorker,
    });
    inspection.current = task;
    return () => {
      task.dispose();
      if (inspection.current === task) inspection.current = null;
    };
  }, []);
  useEffect(() => {
    if (record?.mode === "search" && selected.candidateNumber !== null)
      inspection.current?.start(record, selected.candidateNumber);
    else inspection.current?.reset();
  }, [record, selected.candidateNumber]);

  const detail: ResultsDetail =
    record?.mode !== "search" || selected.candidateNumber === null
      ? idle
      : storedDetail.record === record &&
          storedDetail.detail.status !== "idle" &&
          storedDetail.detail.candidateNumber === selected.candidateNumber
        ? storedDetail.detail
        : { status: "loading", candidateNumber: selected.candidateNumber };
  const surface: ResultSurface | null =
    record?.mode === "fixed"
      ? {
          geometry: record.execution.fixed.geometry,
          preparations: record.execution.fixed.preparations,
          methods: record.execution.fixed.methods,
          location: null,
        }
      : record?.mode === "search" && detail.status === "ready"
        ? {
            geometry: detail.value.geometry,
            preparations: detail.value.preparations,
            methods: detail.value.methods,
            location: detail.value.location,
          }
        : null;
  const validSlice =
    selected.sliceNumber !== null &&
    surface?.geometry.geometry?.slices.some(
      (s) => s.number === selected.sliceNumber,
    )
      ? selected.sliceNumber
      : null;
  const selection: ResultsSelection = { ...selected, sliceNumber: validSlice };
  const overlay: ResultsOverlay | null =
    surface?.geometry.status === "prepared"
      ? { geometry: surface.geometry.geometry, selectedSliceNumber: validSlice }
      : null;

  const updateSelection = useCallback(
    (
      update: (
        previous: ResultsSelection,
        record: CaseResultRecord,
      ) => ResultsSelection,
    ) => {
      const currentRecord = selectedRef.current.record;
      if (!currentRecord) return;
      setStoredSelection((before) => ({
        record: currentRecord,
        value: update(
          before?.record === currentRecord
            ? before.value
            : initialResultsSelection(currentRecord),
          currentRecord,
        ),
      }));
    },
    [],
  );
  const selectMethod = useCallback(
    (method: SearchMethod) =>
      updateSelection((previous, currentRecord) =>
        currentRecord.ready.methods.includes(method)
          ? { ...previous, method }
          : previous,
      ),
    [updateSelection],
  );
  const selectCandidate = useCallback(
    (number: number, method?: SearchMethod) =>
      updateSelection((previous, currentRecord) => {
        if (
          currentRecord.mode !== "search" ||
          !currentRecord.execution.search.candidates.some(
            (candidate) => candidate.location.number === number,
          )
        )
          return previous;
        return {
          method:
            method && currentRecord.ready.methods.includes(method)
              ? method
              : previous.method,
          candidateNumber: number,
          sliceNumber:
            previous.candidateNumber === number ? previous.sliceNumber : null,
        };
      }),
    [updateSelection],
  );
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const selectSlice = useCallback(
    (number: number | null) =>
      updateSelection((previous) => {
        if (
          number !== null &&
          !surfaceRef.current?.geometry.geometry?.slices.some(
            (slice) => slice.number === number,
          )
        )
          return previous;
        return { ...previous, sliceNumber: number };
      }),
    [updateSelection],
  );

  return {
    view,
    selection,
    detail,
    surface,
    overlay,
    selectMethod,
    selectCandidate,
    selectSlice,
  };
}

export type CaseResultsControls = ReturnType<typeof useCaseResults>;
