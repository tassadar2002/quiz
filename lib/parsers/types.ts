export type ParseResult = {
  text: string;
  chapters?: Array<{ id: string; title: string; text: string }>;
};
