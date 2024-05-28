import { Client } from "@notionhq/client";
import type {
	CreatePageParameters,
	CreatePageResponse,
	PageObjectResponse,
	QueryDatabaseParameters,
	QueryDatabaseResponse,
	UpdatePageParameters,
	UpdatePageResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { getCall } from "./BuildCall.js";
import type {
	Query,
	QueryFilter,
	SimpleQueryResponse,
	SingleFilter,
	SupportedNotionColumnTypes,
	apiFilterType,
	apiSingleFilter
} from "./queryTypes.js";

import { camelize } from './camelize.js';
export type propNameToColumnNameType = Record<
	string,
	{ columnName: string; type: SupportedNotionColumnTypes }
>;

export class DatabaseActions<
	DatabaseSchemaType extends Record<string, any>,
	ColumnNameToColumnType extends Record<
		keyof DatabaseSchemaType,
		SupportedNotionColumnTypes
	>
> {
	private NotionClient: Client = new Client({
		auth: process.env.NOTION_TOKEN,
	});
	private databaseId: string;
	private propNameToColumnName: propNameToColumnNameType;
	private columnNames: string[];

	constructor(
		databaseId: string,
		propNameToColumnName: propNameToColumnNameType
	) {
		this.databaseId = databaseId;
		this.propNameToColumnName = propNameToColumnName;
		this.columnNames = Object.keys(propNameToColumnName);
	}

	// Add page to a database
	async add(
		pageObject: Omit<DatabaseSchemaType, 'id'>,
		getCallBody?: boolean
	): Promise<CreatePageParameters | CreatePageResponse> {
		const callBody: CreatePageParameters = {
			parent: {
				database_id: this.databaseId,
			},
			properties: {},
		};

		const columnTypePropNames = Object.keys(pageObject);
		columnTypePropNames.forEach((propName) => {
			const value = pageObject[propName];
			if (value === undefined) {
				return;
			}

			const { type, columnName } = this.propNameToColumnName[propName];
			const columnObject = getCall({
				type,
				value,
			});

			callBody.properties[columnName] = columnObject!;
		});

		// CORS: If user wants the body of the call. Can then send to API
		if (getCallBody) {
			return callBody;
		}

		return await this.NotionClient.pages.create(callBody);
	}


	// Add page to a database
	async update(
		id: string,
		pageObject: Partial<DatabaseSchemaType>,
		getCallBody?: boolean
	): Promise<UpdatePageParameters | UpdatePageResponse> {
		const callBody: UpdatePageParameters & { properties: {} } = {
			page_id: id,
			properties: {},
		};

		const columnTypePropNames = Object.keys(pageObject);
		columnTypePropNames.forEach((propName) => {
			const value = pageObject[propName];
			if (value === undefined) {
				return;
			}

			const { type, columnName } = this.propNameToColumnName[propName];
			const columnObject = getCall({
				type,
				value,
			});

			callBody.properties[columnName] = columnObject!;
		});

		// CORS: If user wants the body of the call. Can then send to API
		if (getCallBody) {
			return callBody;
		}

		return await this.NotionClient.pages.update(callBody);
	}

	async delete(id: string) {
		await this.NotionClient.pages.update({
			page_id: id,
			in_trash: true,
		});
	}

	async get(id: string) {
		const response = await this.NotionClient.pages.retrieve({ page_id: id });

		return {
			rawResponse: response,
			result: this.simplifySingleResult(response as PageObjectResponse),
		}
	}

	// Look for page inside the database
	async query(
		query: Query<DatabaseSchemaType, ColumnNameToColumnType>
	): Promise<SimpleQueryResponse<DatabaseSchemaType>> {
		const queryCall: QueryDatabaseParameters = {
			database_id: this.databaseId,
		};

		const filters = query.filter
			? this.recursivelyBuildFilter(query.filter)
			: undefined;
		if (filters) {
			// @ts-ignore errors vs notion api types
			queryCall["filter"] = filters;
		}

		const sort = query.sort;

		const response = await this.NotionClient.databases.query(queryCall);

		return this.simplifyQueryResponse(response);
	}

	private simplifyQueryResponse(
		res: QueryDatabaseResponse
	): SimpleQueryResponse<DatabaseSchemaType> {
		// Is this smart too do...idk
		const rawResults = res.results as PageObjectResponse[];
		const rawResponse = res;

		const results: DatabaseSchemaType[] = rawResults.map((result) => {
			return this.simplifySingleResult(result);
		});

		return {
			results,
			rawResponse,
		};
	}

	private simplifySingleResult(result: PageObjectResponse) {
		const simpleResult: DatabaseSchemaType = {} as any;
		const properties = Object.entries(result.properties);
		// @ts-ignore
		simpleResult["id"] = result.id;


		for (const [columnName, result] of properties) {
			const camelizeColumnName = camelize(columnName);

			if (!this.propNameToColumnName[camelizeColumnName]) {
				continue;
			}

			const columnType = this.propNameToColumnName[camelizeColumnName].type;

			// @ts-ignore
			simpleResult[camelizeColumnName] = this.getResponseValue(
				columnType,
				result
			);
		}

		return simpleResult;
	}

	private getResponseValue(
		prop: SupportedNotionColumnTypes,
		x: Record<string, any>
	) {
		switch (prop) {
			case "select": {
				const { select } = x;
				if (select) {
					return select["name"];
				}
				return undefined;
			}
			case "title": {
				const { title } = x;
				if (title) {
					const combinedText = title.map(
						({ plain_text }: { plain_text: string }) => plain_text
					);
					return combinedText.join("");
				}
				return undefined;
			}
			case "url": {
				const { url } = x;
				return url;
			}
			case "email": {
				const { email } = x;
				return email;
			}
			case "multi_select": {
				const { multi_select } = x;
				if (multi_select) {
					const multi_selectArr: string[] = multi_select.map(
						({ name }: { name: string }) => name
					);
					return multi_selectArr;
				}
				return undefined;
			}
			case "relation": {
				const { relation } = x as { relation: { id: string }[] };
				if (relation) {
					const ids = relation.map(({ id }: { id: string; }) => id);
					return ids;
				}
				return undefined;
			}
			case "date": {
				const { date } = x;
				if (date) {
					return {
						start: date.start,
						end: date.end,
					};
				}
				return undefined;
			}
			case "checkbox": {
				const { checkbox } = x;
				return checkbox;
			}
			case "unique_id": {
				const { unique_id: { number } } = x;
				return number;
			}
			case "rich_text": {
				const { rich_text } = x;
				if (rich_text) {
					const combinedText = rich_text.map(
						({ plain_text }: { plain_text: string }) => plain_text
					);
					return combinedText.join("");
				}
				return undefined;
			}
			default: {
				console.log("Not implemented yet", prop, x);
				return undefined;
			}
		}
	}

	private recursivelyBuildFilter(
		queryFilter: QueryFilter<DatabaseSchemaType, ColumnNameToColumnType>
	): apiFilterType {
		// Need to loop because we don't kno
		for (const prop in queryFilter) {
			// if the filter is "and" || "or" we need to recursively
			if (prop === "and" || prop === "or") {
				const compoundFilters: QueryFilter<
					DatabaseSchemaType,
					ColumnNameToColumnType
				>[] =
					// @ts-ignore
					queryFilter[prop];

				const compoundApiFilters = compoundFilters.map(
					(i: QueryFilter<DatabaseSchemaType, ColumnNameToColumnType>) => {
						return this.recursivelyBuildFilter(i);
					}
				);

				// Either have an `and` or an `or` compound filter
				let temp: apiFilterType = {
					...(prop === "and"
						? { and: compoundApiFilters }
						: { or: compoundApiFilters }),
				};
				return temp;
			} else {
				const propType = this.propNameToColumnName[prop].type;
				const temp: apiSingleFilter = {
					property: this.propNameToColumnName[prop].columnName,
				};

				//@ts-ignore
				temp[propType] = (queryFilter as SingleFilter<ColumnNameToColumnType>)[
					prop
				];
				return temp;
			}
		}
	}
}
