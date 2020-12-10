type PrecendenceType = "RPAREN" | "LOGICAL" | "COMPARISON";
type FilterFunctionNames = "proximity" | "pi";
type PatternNamesType =
  | "PROPERTY"
  | "COMPARISON"
  | "IS_NULL"
  | "COMMA"
  | "LOGICAL"
  | "VALUE"
  | "FILTER_FUNCTION"
  | "BOOLEAN"
  | "LPAREN"
  | "RPAREN"
  | "SPATIAL"
  | "UNITS"
  | "NOT"
  | "BETWEEN"
  | "BEFORE"
  | "AFTER"
  | "DURING"
  | "RELATIVE"
  | "TIME"
  | "TIME_PERIOD"
  | "GEOMETRY";

type TokenType = {
  type: PatternNamesType | "END";
  text: string;
  remainder: string;
};

type PatternReturnType = RegExp | ((text: string) => string[] | null);

const timePattern = /((([0-9]{4})(-([0-9]{2})(-([0-9]{2})(T([0-9]{2}):([0-9]{2})(:([0-9]{2})(\.([0-9]+))?)?(Z|(([-+])([0-9]{2}):([0-9]{2})))?)?)?)?)|^'')/i,
  patterns = {
    //Allows for non-standard single-quoted property names
    PROPERTY: /^([_a-zA-Z]\w*|"[^"]+"|'[^']+')/,
    COMPARISON: /^(=|<>|<=|<|>=|>|LIKE|ILIKE)/i,
    IS_NULL: /^IS NULL/i,
    COMMA: /^,/,
    LOGICAL: /^(AND|OR)/i,
    VALUE: /^('([^']|'')*'|-?\d+(\.\d*)?|\.\d+)/,
    FILTER_FUNCTION: /^[a-z]\w+\(/,
    BOOLEAN: /^(false|true)/i,
    LPAREN: /^\(/,
    RPAREN: /^\)/,
    SPATIAL: /^(BBOX|INTERSECTS|DWITHIN|WITHIN|CONTAINS)/i,
    UNITS: /^(meters)/i,
    NOT: /^NOT/i,
    BETWEEN: /^BETWEEN/i,
    BEFORE: /^BEFORE/i,
    AFTER: /^AFTER/i,
    DURING: /^DURING/i,
    RELATIVE: /^'RELATIVE\([A-Za-z0-9.]*\)'/i,
    TIME: new RegExp("^" + timePattern.source),
    TIME_PERIOD: new RegExp(
      "^" + timePattern.source + "/" + timePattern.source
    ),
    GEOMETRY(text: string) {
      const type = /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)/.exec(
        text
      );
      if (type) {
        const len = text.length;
        let idx = text.indexOf("(", type[0].length);
        if (idx > -1) {
          let depth = 1;
          while (idx < len && depth > 0) {
            idx++;
            switch (text.charAt(idx)) {
              case "(":
                depth++;
                break;
              case ")":
                depth--;
                break;
              default:
              // in default case, do nothing
            }
          }
        }
        return [text.substr(0, idx + 1)];
      }
      return null;
    },
    END: /^$/,
  } as Record<PatternNamesType | "END", PatternReturnType>,
  follows = {
    ROOT_NODE: [
      "NOT",
      "GEOMETRY",
      "SPATIAL",
      "FILTER_FUNCTION",
      "PROPERTY",
      "LPAREN",
    ],
    LPAREN: [
      "NOT",
      "GEOMETRY",
      "SPATIAL",
      "FILTER_FUNCTION",
      "PROPERTY",
      "VALUE",
      "LPAREN",
    ],
    RPAREN: ["NOT", "LOGICAL", "END", "RPAREN", "COMPARISON", "COMMA"],
    PROPERTY: [
      "COMPARISON",
      "BETWEEN",
      "COMMA",
      "IS_NULL",
      "BEFORE",
      "AFTER",
      "DURING",
      "RPAREN",
    ],
    BETWEEN: ["VALUE"],
    IS_NULL: ["RPAREN", "LOGICAL", "[", "]"],
    COMPARISON: ["RELATIVE", "VALUE", "BOOLEAN"],
    COMMA: ["FILTER_FUNCTION", "GEOMETRY", "VALUE", "UNITS", "PROPERTY"],
    VALUE: ["LOGICAL", "COMMA", "RPAREN", "END"],
    BOOLEAN: ["RPAREN"],
    SPATIAL: ["LPAREN"],
    UNITS: ["RPAREN"],
    LOGICAL: [
      "FILTER_FUNCTION",
      "NOT",
      "VALUE",
      "SPATIAL",
      "PROPERTY",
      "LPAREN",
    ],
    NOT: ["PROPERTY", "LPAREN"],
    GEOMETRY: ["COMMA", "RPAREN"],
    BEFORE: ["TIME"],
    AFTER: ["TIME"],
    DURING: ["TIME_PERIOD"],
    TIME: ["LOGICAL", "RPAREN", "END"],
    TIME_PERIOD: ["LOGICAL", "RPAREN", "END"],
    RELATIVE: ["RPAREN", "END"],
    FILTER_FUNCTION: ["LPAREN", "PROPERTY", "VALUE", "RPAREN"],
    END: [],
  } as Record<
    PatternNamesType | "ROOT_NODE" | "END",
    Array<PatternNamesType | "END">
  >,
  precedence = {
    RPAREN: 3,
    LOGICAL: 2,
    COMPARISON: 1,
  } as Record<PrecendenceType, number>,
  // as an improvement, these could be figured out while building the syntax tree
  filterFunctionParamCount = {
    proximity: 3,
    pi: 0,
  } as Record<FilterFunctionNames, number>,
  dateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";

function tryToken(text: string, pattern: PatternReturnType) {
  if (pattern instanceof RegExp) {
    return pattern.exec(text);
  } else {
    return pattern(text);
  }
}

function nextToken(
  text: string,
  tokens: Array<PatternNamesType | "END">
): TokenType {
  let i,
    token,
    len = tokens.length;
  for (i = 0; i < len; i++) {
    token = tokens[i];
    const pat = patterns[token];
    const matches = tryToken(text, pat);
    if (matches) {
      const match = matches[0];
      const remainder = text.substr(match.length).replace(/^\s*/, "");
      return {
        type: token as TokenType["type"],
        text: match,
        remainder,
      };
    }
  }

  let msg = "ERROR: In parsing: [" + text + "], expected one of: ";
  for (i = 0; i < len; i++) {
    token = tokens[i];
    msg += "\n    " + token + ": " + patterns[token];
  }

  throw new Error(msg);
}
