import type { InputPreparation } from "../core/input";
import type {
  CircularSearchProfile,
  CircularSearchResult,
  RefinementConfig,
  SearchCircleEvaluation,
  SearchProgress,
} from "../core/circular-search";
import type { SearchLocation } from "../core/search-grid";

export type SearchRequest = {
  preparation: InputPreparation;
  profile: CircularSearchProfile;
} & (
  | { type: "run" }
  | { type: "refine"; refinement: RefinementConfig }
  | { type: "inspect"; location: SearchLocation }
);
export type SearchResponse =
  | { type: "progress"; progress: SearchProgress }
  | { type: "result"; result: CircularSearchResult }
  | { type: "detail"; detail: SearchCircleEvaluation }
  | { type: "error"; message: string };
