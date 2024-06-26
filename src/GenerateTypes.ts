import type { DatabaseObjectResponse, GetDatabaseResponse } from '@notionhq/client/build/src/api-endpoints.js';
import * as ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { DATABASES_DIR } from './index.js';
import type { NotionColumnTypes } from './queryTypes.js';
import { camelize } from './camelize.js';

type propNameToColumnNameType = Record<string, { columnName: string; type: NotionColumnTypes }>;

/*
Responsible for generating `.ts` files
*/
export async function createTypescriptFileForDatabase(dbResponse: GetDatabaseResponse) {
  const { id: databaseId, properties, title } = dbResponse as DatabaseObjectResponse;
  const propNameToColumnName: propNameToColumnNameType = {
    id: {
      columnName: 'id',
      type: 'id',
    },
  };
  const databaseName = title[0].plain_text;
  const databaseClassName = camelize(databaseName).replace(/[^a-zA-Z0-9]/g, '');

  const databaseColumnTypeProps: ts.TypeElement[] = [createTextProperty({ name: 'id', isRequired: true })];

  // Looping through each column of database
  Object.values(properties).forEach((value) => {
    const { type: columnType, name: columnName } = value;

    // Taking the column name and camelizing it for typescript use
    const camelizedColumnName = camelize(columnName);

    // Creating map of column name to the column's name in the database's typescript type
    propNameToColumnName[camelizedColumnName] = {
      columnName,
      type: columnType,
    };

    if (
      columnType === 'title' ||
      columnType === 'rich_text' ||
      columnType === 'email' ||
      columnType === 'phone_number'
    ) {
      // add text column to collection type
      databaseColumnTypeProps.push(
        createTextProperty({
          name: camelizedColumnName,
          isRequired: columnType === 'title',
        }),
      );
    } else if (columnType === 'number') {
      // add number column to collection type
      databaseColumnTypeProps.push(createNumberProperty(camelizedColumnName));
    } else if (columnType === 'url') {
      // add url column to collection type
      databaseColumnTypeProps.push(createTextProperty({ name: camelizedColumnName, isRequired: false }));
    } else if (columnType === 'date') {
      // add Date column to collection type
      databaseColumnTypeProps.push(createDateProperty(camelizedColumnName));
    } else if (columnType === 'select' || columnType === 'status' || columnType === 'multi_select') {
      // @ts-ignore
      const options = value[columnType].options.map((x) => x.name);
      databaseColumnTypeProps.push(
        createMultiOptionProp({
          name: camelizedColumnName,
          options,
          isArray: columnType === 'multi_select', // Union or Union Array
        }),
      );
    } else if (columnType === 'relation') {
      databaseColumnTypeProps.push(
        createTextArrayProperty({
          name: camelizedColumnName,
        }),
      );
    } else if (columnType === 'checkbox') {
      databaseColumnTypeProps.push(
        createBooleanProperty({
          name: camelizedColumnName,
        }),
      );
    }
  });

  // Object type that represents the database schema
  const DatabaseSchemaType = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier('DatabaseSchemaType'),
    undefined,
    ts.factory.createTypeLiteralNode(databaseColumnTypeProps),
  );

  // Top level non-nested variable, functions, types for database files
  const TsNodesForDatabaseFile = ts.factory.createNodeArray([
    createNameImport({
      namedImport: 'DatabaseActions',
      path: '../src/DatabaseActions',
    }),
    createNameImport({
      namedImport: 'Query',
      path: '../src/queryTypes',
      isTypeOnly: true,
    }),
    createDatabaseIdVariable(databaseId),
    DatabaseSchemaType,
    createColumnNameToColumnProperties(propNameToColumnName),
    createColumnNameToColumnType(),
    createQueryTypeExport(),
    createDatabaseClassExport({ databaseName: databaseClassName }),
  ]);

  const sourceFile = ts.createSourceFile('', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const printer = ts.createPrinter();

  const typescriptCodeToString = printer.printList(ts.ListFormat.MultiLine, TsNodesForDatabaseFile, sourceFile);
  const transpileToJavaScript = ts.transpile(typescriptCodeToString, {
    module: ts.ModuleKind.None,
    target: ts.ScriptTarget.ESNext,
  });

  // Create databases output folder
  if (!fs.existsSync(DATABASES_DIR)) {
    fs.mkdirSync(DATABASES_DIR);
  }

  // Create TypeScript and JavaScript files
  fs.writeFileSync(path.resolve(DATABASES_DIR, `${databaseClassName}.ts`), typescriptCodeToString);
  fs.writeFileSync(path.resolve(DATABASES_DIR, `${databaseClassName}.js`), transpileToJavaScript);

  return { databaseName, databaseClassName, databaseId };
}

// generate text property
function createTextProperty(args: { name: string; isRequired: boolean }) {
  const { name, isRequired: isRequired } = args;
  const text = ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(name),
    isRequired ? undefined : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
  );
  return text;
}

// generate text property
function createBooleanProperty(args: { name: string }) {
  let { name } = args;
  const text = ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(name),
    undefined,
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword),
  );
  return text;
}

// generate array of text property
function createTextArrayProperty(args: { name: string }) {
  const { name } = args;
  const text = ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(name),
    undefined,
    ts.factory.createArrayTypeNode(ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)),
  );
  return text;
}

/**
 * Generate number property to go inside a type
 * name: number
 */
function createNumberProperty(name: string) {
  const number = ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(name),
    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
  );
  return number;
}

/**
 * For selects and multi-select collection properties
 * array = true for multi-select
 */
function createMultiOptionProp(args: { name: string; options: string[]; isArray: boolean }) {
  const { isArray, name, options } = args;
  return ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(name),
    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    isArray
      ? ts.factory.createArrayTypeNode(
          ts.factory.createParenthesizedType(
            ts.factory.createUnionTypeNode([
              ...options.map((option) => ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(option))),
              createOtherStringProp(),
            ]),
          ),
        )
      : ts.factory.createUnionTypeNode([
          ...options.map((option) => ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(option))),
          createOtherStringProp(),
        ]),
  );
}

// string & {}. Allows users to pass in values
function createOtherStringProp() {
  return ts.factory.createIntersectionTypeNode([
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
    ts.factory.createTypeLiteralNode([]),
  ]);
}

function createDateProperty(name: string) {
  return ts.factory.createPropertySignature(
    undefined,
    ts.factory.createIdentifier(name),
    ts.factory.createToken(ts.SyntaxKind.QuestionToken),
    ts.factory.createTypeLiteralNode([
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier('start'),
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier('end'),
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
    ]),
  );
}

// Generate database Id variable
// const databaseId = <database-id>
function createDatabaseIdVariable(databaseId: string) {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier('databaseId'),
          undefined,
          undefined,
          ts.factory.createStringLiteral(databaseId),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

/**
 * Instead of refering to the column names 1:1 such as "Book Rating", we transform them to
 * camelcase (eg. bookRating). So we need to keep track of the original name and the type
 * for when we construct request for API
 *
 * Example
 *
 * const columnNameToColumnProperties = {
 *
 *      "bookRating": {
 *          columnName: "Book Rating",
 *          type: "select"
 *      },
 *      "genre": {
 *          columnName: "Genre",
 *          type: "multi_select"
 *      }
 *
 * }
 */
function createColumnNameToColumnProperties(colMap: propNameToColumnNameType) {
  return ts.factory.createVariableDeclarationList(
    [
      ts.factory.createVariableDeclaration(
        ts.factory.createIdentifier('columnNameToColumnProperties'),
        undefined,
        undefined,
        ts.factory.createAsExpression(
          ts.factory.createObjectLiteralExpression(
            [
              ...Object.entries(colMap).map(([propName, value]) =>
                ts.factory.createPropertyAssignment(
                  ts.factory.createStringLiteral(propName),
                  ts.factory.createObjectLiteralExpression(
                    [
                      ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier('columnName'),
                        ts.factory.createStringLiteral(value.columnName),
                      ),
                      ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier('type'),
                        ts.factory.createStringLiteral(value.type),
                      ),
                    ],
                    true,
                  ),
                ),
              ),
            ],
            true,
          ),
          ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('const'), undefined),
        ),
      ),
    ],
    ts.NodeFlags.Const,
  );
}

function createColumnNameToColumnType() {
  return ts.factory.createTypeAliasDeclaration(
    undefined,
    ts.factory.createIdentifier('ColumnNameToColumnType'),
    undefined,
    ts.factory.createMappedTypeNode(
      undefined,
      ts.factory.createTypeParameterDeclaration(
        undefined,
        ts.factory.createIdentifier('Property'),
        ts.factory.createTypeOperatorNode(
          ts.SyntaxKind.KeyOfKeyword,
          ts.factory.createTypeQueryNode(ts.factory.createIdentifier('columnNameToColumnProperties'), undefined),
        ),
        undefined,
      ),
      undefined,
      undefined,
      ts.factory.createIndexedAccessTypeNode(
        ts.factory.createIndexedAccessTypeNode(
          ts.factory.createTypeQueryNode(ts.factory.createIdentifier('columnNameToColumnProperties'), undefined),
          ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('Property'), undefined),
        ),
        ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('type')),
      ),
      undefined,
      /* unknown */
    ),
  );
}

// Need to import the database class used to execute database actions (adding + querying)
function createNameImport(args: { namedImport: string; path: string, isTypeOnly?: boolean }) {
  const { namedImport, path } = args;
  return ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      args.isTypeOnly ?? false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(namedImport)),
      ]),
    ),
    ts.factory.createStringLiteral(path),
    undefined,
  );
}

function createQueryTypeExport() {
  return ts.factory.createTypeAliasDeclaration(
    [ts.factory.createToken(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier('QuerySchemaType'),
    undefined,
    ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('Query'), [
      ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('DatabaseSchemaType'), undefined),
      ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('ColumnNameToColumnType'), undefined),
    ]),
  );
}

/**
 * Create export statement for the database class
 * export const <databaseName> = new DatabaseActions<DatabaseSchemaType>(datbaseId, columnNameToColumnProperties)
 */
function createDatabaseClassExport(args: { databaseName: string }) {
  const { databaseName } = args;
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(databaseName),
          undefined,
          undefined,
          ts.factory.createNewExpression(
            ts.factory.createIdentifier('DatabaseActions'),
            [
              ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('DatabaseSchemaType'), undefined),
              ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('ColumnNameToColumnType'), undefined),
            ],
            [ts.factory.createIdentifier('databaseId'), ts.factory.createIdentifier('columnNameToColumnProperties')],
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}
