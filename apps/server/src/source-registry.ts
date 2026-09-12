import { SourceConfigSchema, type SourceConfig } from "@allabout/contracts";

const candidateSources = [
  {
    id: "academic-calendar-csc207",
    kind: "official",
    label: "A&S Academic Calendar — CSC207H1",
    entryUrl: "https://artsci.calendar.utoronto.ca/course/csc207h1",
    allowedHosts: ["artsci.calendar.utoronto.ca"],
    scope: {
      school: "University of Toronto",
      campus: "UTSG",
      term: null,
      course: "CSC207H1",
      section: null,
      entity: null,
    },
    contentMode: "live",
    access: "public",
  },
  {
    id: "uoft-events",
    kind: "official",
    label: "University of Toronto Events",
    entryUrl: "https://www.utoronto.ca/events",
    allowedHosts: ["www.utoronto.ca"],
    scope: {
      school: "University of Toronto",
      campus: "UTSG",
      term: null,
      course: null,
      section: null,
      entity: null,
    },
    contentMode: "live",
    access: "public",
  },
] satisfies SourceConfig[];

export const liveSourceRegistry = SourceConfigSchema.array()
  .min(1)
  .parse(candidateSources);
