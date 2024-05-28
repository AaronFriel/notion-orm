/**
 * Column types' for all query options
 */
// import { PageObjectResponse }

import type { PageObjectResponse, QueryDatabaseResponse } from '@notionhq/client/build/src/api-endpoints.js';

type columnDiscriminatedUnionTypes = PageObjectResponse['properties'];
export type NotionColumnTypes = columnDiscriminatedUnionTypes[keyof columnDiscriminatedUnionTypes]['type'] | "id";
// type SupportedQueryableNotionColumnTypes = Exclude<NotionColumnTypes, "created_by" | >

export type SupportedNotionColumnTypes =
  | 'checkbox'
  // | "array"
  // | "block_id"
  // | "button"
  | 'created_by'
  | 'created_time'
  // | "database_id"
  | 'date'
  | 'email'
  // | "emoji"
  // | "external"
  // | "file"
  // | "files"
  | "formula"
  | 'last_edited_by'
  | 'last_edited_time'
  | 'multi_select'
  | 'number'
  // | "page_id"
  | 'people'
  | 'phone_number'
  | 'relation'
  | 'rich_text'
  // | "rollup"
  | 'select'
  | 'status'
  | 'title'
  | "unique_id"
  | 'id' // placeholder type, not a real type
  | 'url';
// | "verification"
// | "workspace";

// Exclude<
// 	NotionColumnTypes,
// 	| "formula"
// 	| "files"
// 	| "people"
// 	| "rollup"
// 	| "created_by"
// 	| "last_edited_by"
// 	| "created_time"
// 	| "last_edited_time"
// >;

type TextPropertyFilters = {
  equals: string;
  does_not_equal: string;
  contains: string;
  does_not_contain: string;
  starts_with: string;
  ends_with: string;
  is_empty: true;
  is_not_empty: true;
};

type NumberPropertyFilters = {
  equals: number;
  does_not_equals: number;
  greater_than: number;
  less_than: number;
  greater_than_or_equal_to: number;
  less_than_or_equal_to: number;
  is_empty: true;
  is_not_empty: true;
};

type CheckBoxPropertyFilters = {
  equals: boolean;
  does_not_equal: boolean;
};

//
type SelectPropertyFilters<T> = {
  equals: (T extends Array<any> ? T[number] : T) | (string & {});
  does_not_equal: (T extends Array<any> ? T[number] : T) | (string & {});
  is_empty: true;
  is_not_empty: true;
};

// pay in array --> need to turn into union
type MultiSelectPropertyFilters<T> = {
  contains: (T extends Array<any> ? T[number] : T) | (string & {});
  does_not_contain: (T extends Array<any> ? T[number] : T) | (string & {});
  is_empty: true;
  is_not_empty: true;
};

type StatusPropertyFilters<T> = SelectPropertyFilters<T>;

type ISO8601Date = string;
type DatePropertyFilters = {
  equals: ISO8601Date;
  before: ISO8601Date;
  after: ISO8601Date;
  on_or_before: ISO8601Date;
  is_empty: true;
  is_not_empty: true;
  on_or_after: string;
  past_week: {};
  past_month: {};
  past_year: {};
  this_week: {};
  next_week: {};
  next_month: {};
  next_year: {};
};

type UuidPropertyFilters = {
  contains: string;
  does_not_contain: string;
  is_empty: true;
  is_not_empty: true;
};

type UniqueIdPropertyFilters = {
  does_not_equal: string;
  equals: string;
  greater_than: string;
  greater_than_or_equal_to: string;
  less_than: string;
  less_than_or_equal_to: string;
};

export type FilterOptions<T = []> = {
  checkbox: CheckBoxPropertyFilters;
  created_by: UuidPropertyFilters;
  created_time: DatePropertyFilters;
  date: DatePropertyFilters;
  email: TextPropertyFilters;
  last_edited_by: UuidPropertyFilters;
  last_edited_time: DatePropertyFilters;
  multi_select: MultiSelectPropertyFilters<T>;
  number: NumberPropertyFilters;
  people: UuidPropertyFilters;
  phone_number: TextPropertyFilters;
  relation: UuidPropertyFilters;
  rich_text: TextPropertyFilters;
  select: SelectPropertyFilters<T>;
  status: StatusPropertyFilters<T>;
  title: TextPropertyFilters;
  url: TextPropertyFilters;
  id: never;
	unique_id: UniqueIdPropertyFilters;
  formula: {},
};

/**
 * Types to build query object user types out
 */

type ColumnNameToNotionColumnType<T> = Record<keyof T, SupportedNotionColumnTypes>;
type ColumnNameToPossibleValues = Record<string, any>;
// T is a column name to column type
// Y is the collection type
export type SingleFilter<Y extends Record<string, any>, T extends ColumnNameToNotionColumnType<Y>> = {
  // Passing the type from collection
  [Property in keyof Y]?: Partial<FilterOptions<Y[Property]>[T[Property]]>;
};

export type CompoundFilters<Y extends Record<string, any>, T extends Record<keyof Y, SupportedNotionColumnTypes>> =
  | { and: Array<SingleFilter<Y, T> | CompoundFilters<Y, T>> }
  | { or: Array<SingleFilter<Y, T> | CompoundFilters<Y, T>> };

export type QueryFilter<Y extends Record<string, any>, T extends Record<keyof Y, SupportedNotionColumnTypes>> =
  | SingleFilter<Y, T>
  | CompoundFilters<Y, T>;

export type Query<Y extends Record<string, any>, T extends Record<keyof Y, SupportedNotionColumnTypes>> = {
  filter?: QueryFilter<Y, T>;
  sort?: [];
};

export type apiFilterQuery = {
  filter?: apiSingleFilter | apiAndFilter | apiOrFilter;
};

/**
 * Transform the types above to build types to
 * actually build schema for query request
 */

type apiColumnTypeToOptions = {
  [prop in keyof FilterOptions]?: Partial<FilterOptions[prop]>;
};
export interface apiSingleFilter extends apiColumnTypeToOptions {
  property: string;
}

export type apiFilterType = apiSingleFilter | apiAndFilter | apiOrFilter | undefined;
type apiAndFilter = {
  and: Array<apiFilterType>;
};

type apiOrFilter = {
  or: Array<apiFilterType>;
};

export type SimpleQueryResponse<DatabaseSchema> = {
  results: DatabaseSchema[];
  rawResponse: QueryDatabaseResponse;
};
