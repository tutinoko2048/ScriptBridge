export interface BaseAction<ID extends string = string, REQ = unknown, RES = unknown> {
  id: ID,
  request: REQ;
  response: RES;
}