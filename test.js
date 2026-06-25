"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require2() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/@supabase/node-fetch/browser.js
  var browser_exports = {};
  __export(browser_exports, {
    Headers: () => Headers2,
    Request: () => Request,
    Response: () => Response2,
    default: () => browser_default,
    fetch: () => fetch2
  });
  var getGlobal, globalObject, fetch2, browser_default, Headers2, Request, Response2;
  var init_browser = __esm({
    "node_modules/@supabase/node-fetch/browser.js"() {
      "use strict";
      getGlobal = function() {
        if (typeof self !== "undefined") {
          return self;
        }
        if (typeof window !== "undefined") {
          return window;
        }
        if (typeof global !== "undefined") {
          return global;
        }
        throw new Error("unable to locate global object");
      };
      globalObject = getGlobal();
      fetch2 = globalObject.fetch;
      browser_default = globalObject.fetch.bind(globalObject);
      Headers2 = globalObject.Headers;
      Request = globalObject.Request;
      Response2 = globalObject.Response;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/PostgrestError.js
  var require_PostgrestError = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/PostgrestError.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      var PostgrestError2 = class extends Error {
        constructor(context) {
          super(context.message);
          this.name = "PostgrestError";
          this.details = context.details;
          this.hint = context.hint;
          this.code = context.code;
        }
      };
      exports.default = PostgrestError2;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/PostgrestBuilder.js
  var require_PostgrestBuilder = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/PostgrestBuilder.js"(exports) {
      "use strict";
      var __importDefault = exports && exports.__importDefault || function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      var node_fetch_1 = __importDefault((init_browser(), __toCommonJS(browser_exports)));
      var PostgrestError_1 = __importDefault(require_PostgrestError());
      var PostgrestBuilder2 = class {
        constructor(builder) {
          this.shouldThrowOnError = false;
          this.method = builder.method;
          this.url = builder.url;
          this.headers = builder.headers;
          this.schema = builder.schema;
          this.body = builder.body;
          this.shouldThrowOnError = builder.shouldThrowOnError;
          this.signal = builder.signal;
          this.isMaybeSingle = builder.isMaybeSingle;
          if (builder.fetch) {
            this.fetch = builder.fetch;
          } else if (typeof fetch === "undefined") {
            this.fetch = node_fetch_1.default;
          } else {
            this.fetch = fetch;
          }
        }
        /**
         * If there's an error with the query, throwOnError will reject the promise by
         * throwing the error instead of returning it as part of a successful response.
         *
         * {@link https://github.com/supabase/supabase-js/issues/92}
         */
        throwOnError() {
          this.shouldThrowOnError = true;
          return this;
        }
        /**
         * Set an HTTP header for the request.
         */
        setHeader(name, value) {
          this.headers = Object.assign({}, this.headers);
          this.headers[name] = value;
          return this;
        }
        then(onfulfilled, onrejected) {
          if (this.schema === void 0) {
          } else if (["GET", "HEAD"].includes(this.method)) {
            this.headers["Accept-Profile"] = this.schema;
          } else {
            this.headers["Content-Profile"] = this.schema;
          }
          if (this.method !== "GET" && this.method !== "HEAD") {
            this.headers["Content-Type"] = "application/json";
          }
          const _fetch = this.fetch;
          let res = _fetch(this.url.toString(), {
            method: this.method,
            headers: this.headers,
            body: JSON.stringify(this.body),
            signal: this.signal
          }).then(async (res2) => {
            var _a, _b, _c;
            let error = null;
            let data = null;
            let count = null;
            let status = res2.status;
            let statusText = res2.statusText;
            if (res2.ok) {
              if (this.method !== "HEAD") {
                const body = await res2.text();
                if (body === "") {
                } else if (this.headers["Accept"] === "text/csv") {
                  data = body;
                } else if (this.headers["Accept"] && this.headers["Accept"].includes("application/vnd.pgrst.plan+text")) {
                  data = body;
                } else {
                  data = JSON.parse(body);
                }
              }
              const countHeader = (_a = this.headers["Prefer"]) === null || _a === void 0 ? void 0 : _a.match(/count=(exact|planned|estimated)/);
              const contentRange = (_b = res2.headers.get("content-range")) === null || _b === void 0 ? void 0 : _b.split("/");
              if (countHeader && contentRange && contentRange.length > 1) {
                count = parseInt(contentRange[1]);
              }
              if (this.isMaybeSingle && this.method === "GET" && Array.isArray(data)) {
                if (data.length > 1) {
                  error = {
                    // https://github.com/PostgREST/postgrest/blob/a867d79c42419af16c18c3fb019eba8df992626f/src/PostgREST/Error.hs#L553
                    code: "PGRST116",
                    details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 row`,
                    hint: null,
                    message: "JSON object requested, multiple (or no) rows returned"
                  };
                  data = null;
                  count = null;
                  status = 406;
                  statusText = "Not Acceptable";
                } else if (data.length === 1) {
                  data = data[0];
                } else {
                  data = null;
                }
              }
            } else {
              const body = await res2.text();
              try {
                error = JSON.parse(body);
                if (Array.isArray(error) && res2.status === 404) {
                  data = [];
                  error = null;
                  status = 200;
                  statusText = "OK";
                }
              } catch (_d) {
                if (res2.status === 404 && body === "") {
                  status = 204;
                  statusText = "No Content";
                } else {
                  error = {
                    message: body
                  };
                }
              }
              if (error && this.isMaybeSingle && ((_c = error === null || error === void 0 ? void 0 : error.details) === null || _c === void 0 ? void 0 : _c.includes("0 rows"))) {
                error = null;
                status = 200;
                statusText = "OK";
              }
              if (error && this.shouldThrowOnError) {
                throw new PostgrestError_1.default(error);
              }
            }
            const postgrestResponse = {
              error,
              data,
              count,
              status,
              statusText
            };
            return postgrestResponse;
          });
          if (!this.shouldThrowOnError) {
            res = res.catch((fetchError) => {
              var _a, _b, _c;
              return {
                error: {
                  message: `${(_a = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _a !== void 0 ? _a : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`,
                  details: `${(_b = fetchError === null || fetchError === void 0 ? void 0 : fetchError.stack) !== null && _b !== void 0 ? _b : ""}`,
                  hint: "",
                  code: `${(_c = fetchError === null || fetchError === void 0 ? void 0 : fetchError.code) !== null && _c !== void 0 ? _c : ""}`
                },
                data: null,
                count: null,
                status: 0,
                statusText: ""
              };
            });
          }
          return res.then(onfulfilled, onrejected);
        }
      };
      exports.default = PostgrestBuilder2;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/PostgrestTransformBuilder.js
  var require_PostgrestTransformBuilder = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/PostgrestTransformBuilder.js"(exports) {
      "use strict";
      var __importDefault = exports && exports.__importDefault || function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      var PostgrestBuilder_1 = __importDefault(require_PostgrestBuilder());
      var PostgrestTransformBuilder2 = class extends PostgrestBuilder_1.default {
        /**
         * Perform a SELECT on the query result.
         *
         * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
         * return modified rows. By calling this method, modified rows are returned in
         * `data`.
         *
         * @param columns - The columns to retrieve, separated by commas
         */
        select(columns) {
          let quoted = false;
          const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
            if (/\s/.test(c) && !quoted) {
              return "";
            }
            if (c === '"') {
              quoted = !quoted;
            }
            return c;
          }).join("");
          this.url.searchParams.set("select", cleanedColumns);
          if (this.headers["Prefer"]) {
            this.headers["Prefer"] += ",";
          }
          this.headers["Prefer"] += "return=representation";
          return this;
        }
        /**
         * Order the query result by `column`.
         *
         * You can call this method multiple times to order by multiple columns.
         *
         * You can order referenced tables, but it only affects the ordering of the
         * parent table if you use `!inner` in the query.
         *
         * @param column - The column to order by
         * @param options - Named parameters
         * @param options.ascending - If `true`, the result will be in ascending order
         * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
         * `null`s appear last.
         * @param options.referencedTable - Set this to order a referenced table by
         * its columns
         * @param options.foreignTable - Deprecated, use `options.referencedTable`
         * instead
         */
        order(column, { ascending = true, nullsFirst, foreignTable, referencedTable = foreignTable } = {}) {
          const key = referencedTable ? `${referencedTable}.order` : "order";
          const existingOrder = this.url.searchParams.get(key);
          this.url.searchParams.set(key, `${existingOrder ? `${existingOrder},` : ""}${column}.${ascending ? "asc" : "desc"}${nullsFirst === void 0 ? "" : nullsFirst ? ".nullsfirst" : ".nullslast"}`);
          return this;
        }
        /**
         * Limit the query result by `count`.
         *
         * @param count - The maximum number of rows to return
         * @param options - Named parameters
         * @param options.referencedTable - Set this to limit rows of referenced
         * tables instead of the parent table
         * @param options.foreignTable - Deprecated, use `options.referencedTable`
         * instead
         */
        limit(count, { foreignTable, referencedTable = foreignTable } = {}) {
          const key = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
          this.url.searchParams.set(key, `${count}`);
          return this;
        }
        /**
         * Limit the query result by starting at an offset `from` and ending at the offset `to`.
         * Only records within this range are returned.
         * This respects the query order and if there is no order clause the range could behave unexpectedly.
         * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
         * and fourth rows of the query.
         *
         * @param from - The starting index from which to limit the result
         * @param to - The last index to which to limit the result
         * @param options - Named parameters
         * @param options.referencedTable - Set this to limit rows of referenced
         * tables instead of the parent table
         * @param options.foreignTable - Deprecated, use `options.referencedTable`
         * instead
         */
        range(from, to, { foreignTable, referencedTable = foreignTable } = {}) {
          const keyOffset = typeof referencedTable === "undefined" ? "offset" : `${referencedTable}.offset`;
          const keyLimit = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
          this.url.searchParams.set(keyOffset, `${from}`);
          this.url.searchParams.set(keyLimit, `${to - from + 1}`);
          return this;
        }
        /**
         * Set the AbortSignal for the fetch request.
         *
         * @param signal - The AbortSignal to use for the fetch request
         */
        abortSignal(signal) {
          this.signal = signal;
          return this;
        }
        /**
         * Return `data` as a single object instead of an array of objects.
         *
         * Query result must be one row (e.g. using `.limit(1)`), otherwise this
         * returns an error.
         */
        single() {
          this.headers["Accept"] = "application/vnd.pgrst.object+json";
          return this;
        }
        /**
         * Return `data` as a single object instead of an array of objects.
         *
         * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
         * this returns an error.
         */
        maybeSingle() {
          if (this.method === "GET") {
            this.headers["Accept"] = "application/json";
          } else {
            this.headers["Accept"] = "application/vnd.pgrst.object+json";
          }
          this.isMaybeSingle = true;
          return this;
        }
        /**
         * Return `data` as a string in CSV format.
         */
        csv() {
          this.headers["Accept"] = "text/csv";
          return this;
        }
        /**
         * Return `data` as an object in [GeoJSON](https://geojson.org) format.
         */
        geojson() {
          this.headers["Accept"] = "application/geo+json";
          return this;
        }
        /**
         * Return `data` as the EXPLAIN plan for the query.
         *
         * You need to enable the
         * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
         * setting before using this method.
         *
         * @param options - Named parameters
         *
         * @param options.analyze - If `true`, the query will be executed and the
         * actual run time will be returned
         *
         * @param options.verbose - If `true`, the query identifier will be returned
         * and `data` will include the output columns of the query
         *
         * @param options.settings - If `true`, include information on configuration
         * parameters that affect query planning
         *
         * @param options.buffers - If `true`, include information on buffer usage
         *
         * @param options.wal - If `true`, include information on WAL record generation
         *
         * @param options.format - The format of the output, can be `"text"` (default)
         * or `"json"`
         */
        explain({ analyze = false, verbose = false, settings = false, buffers = false, wal = false, format = "text" } = {}) {
          var _a;
          const options = [
            analyze ? "analyze" : null,
            verbose ? "verbose" : null,
            settings ? "settings" : null,
            buffers ? "buffers" : null,
            wal ? "wal" : null
          ].filter(Boolean).join("|");
          const forMediatype = (_a = this.headers["Accept"]) !== null && _a !== void 0 ? _a : "application/json";
          this.headers["Accept"] = `application/vnd.pgrst.plan+${format}; for="${forMediatype}"; options=${options};`;
          if (format === "json")
            return this;
          else
            return this;
        }
        /**
         * Rollback the query.
         *
         * `data` will still be returned, but the query is not committed.
         */
        rollback() {
          var _a;
          if (((_a = this.headers["Prefer"]) !== null && _a !== void 0 ? _a : "").trim().length > 0) {
            this.headers["Prefer"] += ",tx=rollback";
          } else {
            this.headers["Prefer"] = "tx=rollback";
          }
          return this;
        }
        /**
         * Override the type of the returned `data`.
         *
         * @typeParam NewResult - The new result type to override with
         */
        returns() {
          return this;
        }
      };
      exports.default = PostgrestTransformBuilder2;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/PostgrestFilterBuilder.js
  var require_PostgrestFilterBuilder = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/PostgrestFilterBuilder.js"(exports) {
      "use strict";
      var __importDefault = exports && exports.__importDefault || function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      var PostgrestTransformBuilder_1 = __importDefault(require_PostgrestTransformBuilder());
      var PostgrestFilterBuilder2 = class extends PostgrestTransformBuilder_1.default {
        /**
         * Match only rows where `column` is equal to `value`.
         *
         * To check if the value of `column` is NULL, you should use `.is()` instead.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        eq(column, value) {
          this.url.searchParams.append(column, `eq.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` is not equal to `value`.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        neq(column, value) {
          this.url.searchParams.append(column, `neq.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` is greater than `value`.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        gt(column, value) {
          this.url.searchParams.append(column, `gt.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` is greater than or equal to `value`.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        gte(column, value) {
          this.url.searchParams.append(column, `gte.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` is less than `value`.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        lt(column, value) {
          this.url.searchParams.append(column, `lt.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` is less than or equal to `value`.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        lte(column, value) {
          this.url.searchParams.append(column, `lte.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` matches `pattern` case-sensitively.
         *
         * @param column - The column to filter on
         * @param pattern - The pattern to match with
         */
        like(column, pattern) {
          this.url.searchParams.append(column, `like.${pattern}`);
          return this;
        }
        /**
         * Match only rows where `column` matches all of `patterns` case-sensitively.
         *
         * @param column - The column to filter on
         * @param patterns - The patterns to match with
         */
        likeAllOf(column, patterns) {
          this.url.searchParams.append(column, `like(all).{${patterns.join(",")}}`);
          return this;
        }
        /**
         * Match only rows where `column` matches any of `patterns` case-sensitively.
         *
         * @param column - The column to filter on
         * @param patterns - The patterns to match with
         */
        likeAnyOf(column, patterns) {
          this.url.searchParams.append(column, `like(any).{${patterns.join(",")}}`);
          return this;
        }
        /**
         * Match only rows where `column` matches `pattern` case-insensitively.
         *
         * @param column - The column to filter on
         * @param pattern - The pattern to match with
         */
        ilike(column, pattern) {
          this.url.searchParams.append(column, `ilike.${pattern}`);
          return this;
        }
        /**
         * Match only rows where `column` matches all of `patterns` case-insensitively.
         *
         * @param column - The column to filter on
         * @param patterns - The patterns to match with
         */
        ilikeAllOf(column, patterns) {
          this.url.searchParams.append(column, `ilike(all).{${patterns.join(",")}}`);
          return this;
        }
        /**
         * Match only rows where `column` matches any of `patterns` case-insensitively.
         *
         * @param column - The column to filter on
         * @param patterns - The patterns to match with
         */
        ilikeAnyOf(column, patterns) {
          this.url.searchParams.append(column, `ilike(any).{${patterns.join(",")}}`);
          return this;
        }
        /**
         * Match only rows where `column` IS `value`.
         *
         * For non-boolean columns, this is only relevant for checking if the value of
         * `column` is NULL by setting `value` to `null`.
         *
         * For boolean columns, you can also set `value` to `true` or `false` and it
         * will behave the same way as `.eq()`.
         *
         * @param column - The column to filter on
         * @param value - The value to filter with
         */
        is(column, value) {
          this.url.searchParams.append(column, `is.${value}`);
          return this;
        }
        /**
         * Match only rows where `column` is included in the `values` array.
         *
         * @param column - The column to filter on
         * @param values - The values array to filter with
         */
        in(column, values) {
          const cleanedValues = Array.from(new Set(values)).map((s) => {
            if (typeof s === "string" && new RegExp("[,()]").test(s))
              return `"${s}"`;
            else
              return `${s}`;
          }).join(",");
          this.url.searchParams.append(column, `in.(${cleanedValues})`);
          return this;
        }
        /**
         * Only relevant for jsonb, array, and range columns. Match only rows where
         * `column` contains every element appearing in `value`.
         *
         * @param column - The jsonb, array, or range column to filter on
         * @param value - The jsonb, array, or range value to filter with
         */
        contains(column, value) {
          if (typeof value === "string") {
            this.url.searchParams.append(column, `cs.${value}`);
          } else if (Array.isArray(value)) {
            this.url.searchParams.append(column, `cs.{${value.join(",")}}`);
          } else {
            this.url.searchParams.append(column, `cs.${JSON.stringify(value)}`);
          }
          return this;
        }
        /**
         * Only relevant for jsonb, array, and range columns. Match only rows where
         * every element appearing in `column` is contained by `value`.
         *
         * @param column - The jsonb, array, or range column to filter on
         * @param value - The jsonb, array, or range value to filter with
         */
        containedBy(column, value) {
          if (typeof value === "string") {
            this.url.searchParams.append(column, `cd.${value}`);
          } else if (Array.isArray(value)) {
            this.url.searchParams.append(column, `cd.{${value.join(",")}}`);
          } else {
            this.url.searchParams.append(column, `cd.${JSON.stringify(value)}`);
          }
          return this;
        }
        /**
         * Only relevant for range columns. Match only rows where every element in
         * `column` is greater than any element in `range`.
         *
         * @param column - The range column to filter on
         * @param range - The range to filter with
         */
        rangeGt(column, range) {
          this.url.searchParams.append(column, `sr.${range}`);
          return this;
        }
        /**
         * Only relevant for range columns. Match only rows where every element in
         * `column` is either contained in `range` or greater than any element in
         * `range`.
         *
         * @param column - The range column to filter on
         * @param range - The range to filter with
         */
        rangeGte(column, range) {
          this.url.searchParams.append(column, `nxl.${range}`);
          return this;
        }
        /**
         * Only relevant for range columns. Match only rows where every element in
         * `column` is less than any element in `range`.
         *
         * @param column - The range column to filter on
         * @param range - The range to filter with
         */
        rangeLt(column, range) {
          this.url.searchParams.append(column, `sl.${range}`);
          return this;
        }
        /**
         * Only relevant for range columns. Match only rows where every element in
         * `column` is either contained in `range` or less than any element in
         * `range`.
         *
         * @param column - The range column to filter on
         * @param range - The range to filter with
         */
        rangeLte(column, range) {
          this.url.searchParams.append(column, `nxr.${range}`);
          return this;
        }
        /**
         * Only relevant for range columns. Match only rows where `column` is
         * mutually exclusive to `range` and there can be no element between the two
         * ranges.
         *
         * @param column - The range column to filter on
         * @param range - The range to filter with
         */
        rangeAdjacent(column, range) {
          this.url.searchParams.append(column, `adj.${range}`);
          return this;
        }
        /**
         * Only relevant for array and range columns. Match only rows where
         * `column` and `value` have an element in common.
         *
         * @param column - The array or range column to filter on
         * @param value - The array or range value to filter with
         */
        overlaps(column, value) {
          if (typeof value === "string") {
            this.url.searchParams.append(column, `ov.${value}`);
          } else {
            this.url.searchParams.append(column, `ov.{${value.join(",")}}`);
          }
          return this;
        }
        /**
         * Only relevant for text and tsvector columns. Match only rows where
         * `column` matches the query string in `query`.
         *
         * @param column - The text or tsvector column to filter on
         * @param query - The query text to match with
         * @param options - Named parameters
         * @param options.config - The text search configuration to use
         * @param options.type - Change how the `query` text is interpreted
         */
        textSearch(column, query, { config, type } = {}) {
          let typePart = "";
          if (type === "plain") {
            typePart = "pl";
          } else if (type === "phrase") {
            typePart = "ph";
          } else if (type === "websearch") {
            typePart = "w";
          }
          const configPart = config === void 0 ? "" : `(${config})`;
          this.url.searchParams.append(column, `${typePart}fts${configPart}.${query}`);
          return this;
        }
        /**
         * Match only rows where each column in `query` keys is equal to its
         * associated value. Shorthand for multiple `.eq()`s.
         *
         * @param query - The object to filter with, with column names as keys mapped
         * to their filter values
         */
        match(query) {
          Object.entries(query).forEach(([column, value]) => {
            this.url.searchParams.append(column, `eq.${value}`);
          });
          return this;
        }
        /**
         * Match only rows which doesn't satisfy the filter.
         *
         * Unlike most filters, `opearator` and `value` are used as-is and need to
         * follow [PostgREST
         * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
         * to make sure they are properly sanitized.
         *
         * @param column - The column to filter on
         * @param operator - The operator to be negated to filter with, following
         * PostgREST syntax
         * @param value - The value to filter with, following PostgREST syntax
         */
        not(column, operator, value) {
          this.url.searchParams.append(column, `not.${operator}.${value}`);
          return this;
        }
        /**
         * Match only rows which satisfy at least one of the filters.
         *
         * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
         * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
         * to make sure it's properly sanitized.
         *
         * It's currently not possible to do an `.or()` filter across multiple tables.
         *
         * @param filters - The filters to use, following PostgREST syntax
         * @param options - Named parameters
         * @param options.referencedTable - Set this to filter on referenced tables
         * instead of the parent table
         * @param options.foreignTable - Deprecated, use `referencedTable` instead
         */
        or(filters, { foreignTable, referencedTable = foreignTable } = {}) {
          const key = referencedTable ? `${referencedTable}.or` : "or";
          this.url.searchParams.append(key, `(${filters})`);
          return this;
        }
        /**
         * Match only rows which satisfy the filter. This is an escape hatch - you
         * should use the specific filter methods wherever possible.
         *
         * Unlike most filters, `opearator` and `value` are used as-is and need to
         * follow [PostgREST
         * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
         * to make sure they are properly sanitized.
         *
         * @param column - The column to filter on
         * @param operator - The operator to filter with, following PostgREST syntax
         * @param value - The value to filter with, following PostgREST syntax
         */
        filter(column, operator, value) {
          this.url.searchParams.append(column, `${operator}.${value}`);
          return this;
        }
      };
      exports.default = PostgrestFilterBuilder2;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/PostgrestQueryBuilder.js
  var require_PostgrestQueryBuilder = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/PostgrestQueryBuilder.js"(exports) {
      "use strict";
      var __importDefault = exports && exports.__importDefault || function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      var PostgrestFilterBuilder_1 = __importDefault(require_PostgrestFilterBuilder());
      var PostgrestQueryBuilder2 = class {
        constructor(url, { headers = {}, schema, fetch: fetch3 }) {
          this.url = url;
          this.headers = headers;
          this.schema = schema;
          this.fetch = fetch3;
        }
        /**
         * Perform a SELECT query on the table or view.
         *
         * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
         *
         * @param options - Named parameters
         *
         * @param options.head - When set to `true`, `data` will not be returned.
         * Useful if you only need the count.
         *
         * @param options.count - Count algorithm to use to count rows in the table or view.
         *
         * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
         * hood.
         *
         * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
         * statistics under the hood.
         *
         * `"estimated"`: Uses exact count for low numbers and planned count for high
         * numbers.
         */
        select(columns, { head: head2 = false, count } = {}) {
          const method = head2 ? "HEAD" : "GET";
          let quoted = false;
          const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
            if (/\s/.test(c) && !quoted) {
              return "";
            }
            if (c === '"') {
              quoted = !quoted;
            }
            return c;
          }).join("");
          this.url.searchParams.set("select", cleanedColumns);
          if (count) {
            this.headers["Prefer"] = `count=${count}`;
          }
          return new PostgrestFilterBuilder_1.default({
            method,
            url: this.url,
            headers: this.headers,
            schema: this.schema,
            fetch: this.fetch,
            allowEmpty: false
          });
        }
        /**
         * Perform an INSERT into the table or view.
         *
         * By default, inserted rows are not returned. To return it, chain the call
         * with `.select()`.
         *
         * @param values - The values to insert. Pass an object to insert a single row
         * or an array to insert multiple rows.
         *
         * @param options - Named parameters
         *
         * @param options.count - Count algorithm to use to count inserted rows.
         *
         * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
         * hood.
         *
         * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
         * statistics under the hood.
         *
         * `"estimated"`: Uses exact count for low numbers and planned count for high
         * numbers.
         *
         * @param options.defaultToNull - Make missing fields default to `null`.
         * Otherwise, use the default value for the column. Only applies for bulk
         * inserts.
         */
        insert(values, { count, defaultToNull = true } = {}) {
          const method = "POST";
          const prefersHeaders = [];
          if (this.headers["Prefer"]) {
            prefersHeaders.push(this.headers["Prefer"]);
          }
          if (count) {
            prefersHeaders.push(`count=${count}`);
          }
          if (!defaultToNull) {
            prefersHeaders.push("missing=default");
          }
          this.headers["Prefer"] = prefersHeaders.join(",");
          if (Array.isArray(values)) {
            const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
            if (columns.length > 0) {
              const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
              this.url.searchParams.set("columns", uniqueColumns.join(","));
            }
          }
          return new PostgrestFilterBuilder_1.default({
            method,
            url: this.url,
            headers: this.headers,
            schema: this.schema,
            body: values,
            fetch: this.fetch,
            allowEmpty: false
          });
        }
        /**
         * Perform an UPSERT on the table or view. Depending on the column(s) passed
         * to `onConflict`, `.upsert()` allows you to perform the equivalent of
         * `.insert()` if a row with the corresponding `onConflict` columns doesn't
         * exist, or if it does exist, perform an alternative action depending on
         * `ignoreDuplicates`.
         *
         * By default, upserted rows are not returned. To return it, chain the call
         * with `.select()`.
         *
         * @param values - The values to upsert with. Pass an object to upsert a
         * single row or an array to upsert multiple rows.
         *
         * @param options - Named parameters
         *
         * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
         * duplicate rows are determined. Two rows are duplicates if all the
         * `onConflict` columns are equal.
         *
         * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
         * `false`, duplicate rows are merged with existing rows.
         *
         * @param options.count - Count algorithm to use to count upserted rows.
         *
         * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
         * hood.
         *
         * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
         * statistics under the hood.
         *
         * `"estimated"`: Uses exact count for low numbers and planned count for high
         * numbers.
         *
         * @param options.defaultToNull - Make missing fields default to `null`.
         * Otherwise, use the default value for the column. This only applies when
         * inserting new rows, not when merging with existing rows under
         * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
         */
        upsert(values, { onConflict, ignoreDuplicates = false, count, defaultToNull = true } = {}) {
          const method = "POST";
          const prefersHeaders = [`resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates`];
          if (onConflict !== void 0)
            this.url.searchParams.set("on_conflict", onConflict);
          if (this.headers["Prefer"]) {
            prefersHeaders.push(this.headers["Prefer"]);
          }
          if (count) {
            prefersHeaders.push(`count=${count}`);
          }
          if (!defaultToNull) {
            prefersHeaders.push("missing=default");
          }
          this.headers["Prefer"] = prefersHeaders.join(",");
          if (Array.isArray(values)) {
            const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
            if (columns.length > 0) {
              const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
              this.url.searchParams.set("columns", uniqueColumns.join(","));
            }
          }
          return new PostgrestFilterBuilder_1.default({
            method,
            url: this.url,
            headers: this.headers,
            schema: this.schema,
            body: values,
            fetch: this.fetch,
            allowEmpty: false
          });
        }
        /**
         * Perform an UPDATE on the table or view.
         *
         * By default, updated rows are not returned. To return it, chain the call
         * with `.select()` after filters.
         *
         * @param values - The values to update with
         *
         * @param options - Named parameters
         *
         * @param options.count - Count algorithm to use to count updated rows.
         *
         * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
         * hood.
         *
         * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
         * statistics under the hood.
         *
         * `"estimated"`: Uses exact count for low numbers and planned count for high
         * numbers.
         */
        update(values, { count } = {}) {
          const method = "PATCH";
          const prefersHeaders = [];
          if (this.headers["Prefer"]) {
            prefersHeaders.push(this.headers["Prefer"]);
          }
          if (count) {
            prefersHeaders.push(`count=${count}`);
          }
          this.headers["Prefer"] = prefersHeaders.join(",");
          return new PostgrestFilterBuilder_1.default({
            method,
            url: this.url,
            headers: this.headers,
            schema: this.schema,
            body: values,
            fetch: this.fetch,
            allowEmpty: false
          });
        }
        /**
         * Perform a DELETE on the table or view.
         *
         * By default, deleted rows are not returned. To return it, chain the call
         * with `.select()` after filters.
         *
         * @param options - Named parameters
         *
         * @param options.count - Count algorithm to use to count deleted rows.
         *
         * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
         * hood.
         *
         * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
         * statistics under the hood.
         *
         * `"estimated"`: Uses exact count for low numbers and planned count for high
         * numbers.
         */
        delete({ count } = {}) {
          const method = "DELETE";
          const prefersHeaders = [];
          if (count) {
            prefersHeaders.push(`count=${count}`);
          }
          if (this.headers["Prefer"]) {
            prefersHeaders.unshift(this.headers["Prefer"]);
          }
          this.headers["Prefer"] = prefersHeaders.join(",");
          return new PostgrestFilterBuilder_1.default({
            method,
            url: this.url,
            headers: this.headers,
            schema: this.schema,
            fetch: this.fetch,
            allowEmpty: false
          });
        }
      };
      exports.default = PostgrestQueryBuilder2;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/version.js
  var require_version = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/version.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.version = void 0;
      exports.version = "0.0.0-automated";
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/constants.js
  var require_constants = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/constants.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.DEFAULT_HEADERS = void 0;
      var version_1 = require_version();
      exports.DEFAULT_HEADERS = { "X-Client-Info": `postgrest-js/${version_1.version}` };
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/PostgrestClient.js
  var require_PostgrestClient = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/PostgrestClient.js"(exports) {
      "use strict";
      var __importDefault = exports && exports.__importDefault || function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      var PostgrestQueryBuilder_1 = __importDefault(require_PostgrestQueryBuilder());
      var PostgrestFilterBuilder_1 = __importDefault(require_PostgrestFilterBuilder());
      var constants_1 = require_constants();
      var PostgrestClient2 = class _PostgrestClient {
        // TODO: Add back shouldThrowOnError once we figure out the typings
        /**
         * Creates a PostgREST client.
         *
         * @param url - URL of the PostgREST endpoint
         * @param options - Named parameters
         * @param options.headers - Custom headers
         * @param options.schema - Postgres schema to switch to
         * @param options.fetch - Custom fetch
         */
        constructor(url, { headers = {}, schema, fetch: fetch3 } = {}) {
          this.url = url;
          this.headers = Object.assign(Object.assign({}, constants_1.DEFAULT_HEADERS), headers);
          this.schemaName = schema;
          this.fetch = fetch3;
        }
        /**
         * Perform a query on a table or a view.
         *
         * @param relation - The table or view name to query
         */
        from(relation) {
          const url = new URL(`${this.url}/${relation}`);
          return new PostgrestQueryBuilder_1.default(url, {
            headers: Object.assign({}, this.headers),
            schema: this.schemaName,
            fetch: this.fetch
          });
        }
        /**
         * Select a schema to query or perform an function (rpc) call.
         *
         * The schema needs to be on the list of exposed schemas inside Supabase.
         *
         * @param schema - The schema to query
         */
        schema(schema) {
          return new _PostgrestClient(this.url, {
            headers: this.headers,
            schema,
            fetch: this.fetch
          });
        }
        /**
         * Perform a function call.
         *
         * @param fn - The function name to call
         * @param args - The arguments to pass to the function call
         * @param options - Named parameters
         * @param options.head - When set to `true`, `data` will not be returned.
         * Useful if you only need the count.
         * @param options.get - When set to `true`, the function will be called with
         * read-only access mode.
         * @param options.count - Count algorithm to use to count rows returned by the
         * function. Only applicable for [set-returning
         * functions](https://www.postgresql.org/docs/current/functions-srf.html).
         *
         * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
         * hood.
         *
         * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
         * statistics under the hood.
         *
         * `"estimated"`: Uses exact count for low numbers and planned count for high
         * numbers.
         */
        rpc(fn, args = {}, { head: head2 = false, get: get2 = false, count } = {}) {
          let method;
          const url = new URL(`${this.url}/rpc/${fn}`);
          let body;
          if (head2 || get2) {
            method = head2 ? "HEAD" : "GET";
            Object.entries(args).filter(([_, value]) => value !== void 0).map(([name, value]) => [name, Array.isArray(value) ? `{${value.join(",")}}` : `${value}`]).forEach(([name, value]) => {
              url.searchParams.append(name, value);
            });
          } else {
            method = "POST";
            body = args;
          }
          const headers = Object.assign({}, this.headers);
          if (count) {
            headers["Prefer"] = `count=${count}`;
          }
          return new PostgrestFilterBuilder_1.default({
            method,
            url,
            headers,
            schema: this.schemaName,
            body,
            fetch: this.fetch,
            allowEmpty: false
          });
        }
      };
      exports.default = PostgrestClient2;
    }
  });

  // node_modules/@supabase/postgrest-js/dist/cjs/index.js
  var require_cjs = __commonJS({
    "node_modules/@supabase/postgrest-js/dist/cjs/index.js"(exports) {
      "use strict";
      var __importDefault = exports && exports.__importDefault || function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.PostgrestError = exports.PostgrestBuilder = exports.PostgrestTransformBuilder = exports.PostgrestFilterBuilder = exports.PostgrestQueryBuilder = exports.PostgrestClient = void 0;
      var PostgrestClient_1 = __importDefault(require_PostgrestClient());
      exports.PostgrestClient = PostgrestClient_1.default;
      var PostgrestQueryBuilder_1 = __importDefault(require_PostgrestQueryBuilder());
      exports.PostgrestQueryBuilder = PostgrestQueryBuilder_1.default;
      var PostgrestFilterBuilder_1 = __importDefault(require_PostgrestFilterBuilder());
      exports.PostgrestFilterBuilder = PostgrestFilterBuilder_1.default;
      var PostgrestTransformBuilder_1 = __importDefault(require_PostgrestTransformBuilder());
      exports.PostgrestTransformBuilder = PostgrestTransformBuilder_1.default;
      var PostgrestBuilder_1 = __importDefault(require_PostgrestBuilder());
      exports.PostgrestBuilder = PostgrestBuilder_1.default;
      var PostgrestError_1 = __importDefault(require_PostgrestError());
      exports.PostgrestError = PostgrestError_1.default;
      exports.default = {
        PostgrestClient: PostgrestClient_1.default,
        PostgrestQueryBuilder: PostgrestQueryBuilder_1.default,
        PostgrestFilterBuilder: PostgrestFilterBuilder_1.default,
        PostgrestTransformBuilder: PostgrestTransformBuilder_1.default,
        PostgrestBuilder: PostgrestBuilder_1.default,
        PostgrestError: PostgrestError_1.default
      };
    }
  });

  // node_modules/ws/browser.js
  var require_browser = __commonJS({
    "node_modules/ws/browser.js"(exports, module) {
      "use strict";
      module.exports = function() {
        throw new Error(
          "ws does not work in the browser. Browser clients must use the native WebSocket object"
        );
      };
    }
  });

  // components/ProgramDisplay.tsx
  var import_react = __toESM(__require("react"), 1);
  var import_lucide_react = __require("lucide-react");

  // constants.tsx
  var DAYS_OF_WEEK_FULL = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  // node_modules/@supabase/functions-js/dist/module/helper.js
  var resolveFetch = (customFetch) => {
    let _fetch;
    if (customFetch) {
      _fetch = customFetch;
    } else if (typeof fetch === "undefined") {
      _fetch = (...args) => Promise.resolve().then(() => (init_browser(), browser_exports)).then(({ default: fetch3 }) => fetch3(...args));
    } else {
      _fetch = fetch;
    }
    return (...args) => _fetch(...args);
  };

  // node_modules/@supabase/functions-js/dist/module/types.js
  var FunctionsError = class extends Error {
    constructor(message, name = "FunctionsError", context) {
      super(message);
      this.name = name;
      this.context = context;
    }
  };
  var FunctionsFetchError = class extends FunctionsError {
    constructor(context) {
      super("Failed to send a request to the Edge Function", "FunctionsFetchError", context);
    }
  };
  var FunctionsRelayError = class extends FunctionsError {
    constructor(context) {
      super("Relay Error invoking the Edge Function", "FunctionsRelayError", context);
    }
  };
  var FunctionsHttpError = class extends FunctionsError {
    constructor(context) {
      super("Edge Function returned a non-2xx status code", "FunctionsHttpError", context);
    }
  };
  var FunctionRegion;
  (function(FunctionRegion2) {
    FunctionRegion2["Any"] = "any";
    FunctionRegion2["ApNortheast1"] = "ap-northeast-1";
    FunctionRegion2["ApNortheast2"] = "ap-northeast-2";
    FunctionRegion2["ApSouth1"] = "ap-south-1";
    FunctionRegion2["ApSoutheast1"] = "ap-southeast-1";
    FunctionRegion2["ApSoutheast2"] = "ap-southeast-2";
    FunctionRegion2["CaCentral1"] = "ca-central-1";
    FunctionRegion2["EuCentral1"] = "eu-central-1";
    FunctionRegion2["EuWest1"] = "eu-west-1";
    FunctionRegion2["EuWest2"] = "eu-west-2";
    FunctionRegion2["EuWest3"] = "eu-west-3";
    FunctionRegion2["SaEast1"] = "sa-east-1";
    FunctionRegion2["UsEast1"] = "us-east-1";
    FunctionRegion2["UsWest1"] = "us-west-1";
    FunctionRegion2["UsWest2"] = "us-west-2";
  })(FunctionRegion || (FunctionRegion = {}));

  // node_modules/@supabase/functions-js/dist/module/FunctionsClient.js
  var __awaiter = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var FunctionsClient = class {
    constructor(url, { headers = {}, customFetch, region = FunctionRegion.Any } = {}) {
      this.url = url;
      this.headers = headers;
      this.region = region;
      this.fetch = resolveFetch(customFetch);
    }
    /**
     * Updates the authorization header
     * @param token - the new jwt token sent in the authorisation header
     */
    setAuth(token) {
      this.headers.Authorization = `Bearer ${token}`;
    }
    /**
     * Invokes a function
     * @param functionName - The name of the Function to invoke.
     * @param options - Options for invoking the Function.
     */
    invoke(functionName, options = {}) {
      var _a;
      return __awaiter(this, void 0, void 0, function* () {
        try {
          const { headers, method, body: functionArgs } = options;
          let _headers = {};
          let { region } = options;
          if (!region) {
            region = this.region;
          }
          if (region && region !== "any") {
            _headers["x-region"] = region;
          }
          let body;
          if (functionArgs && (headers && !Object.prototype.hasOwnProperty.call(headers, "Content-Type") || !headers)) {
            if (typeof Blob !== "undefined" && functionArgs instanceof Blob || functionArgs instanceof ArrayBuffer) {
              _headers["Content-Type"] = "application/octet-stream";
              body = functionArgs;
            } else if (typeof functionArgs === "string") {
              _headers["Content-Type"] = "text/plain";
              body = functionArgs;
            } else if (typeof FormData !== "undefined" && functionArgs instanceof FormData) {
              body = functionArgs;
            } else {
              _headers["Content-Type"] = "application/json";
              body = JSON.stringify(functionArgs);
            }
          }
          const response = yield this.fetch(`${this.url}/${functionName}`, {
            method: method || "POST",
            // headers priority is (high to low):
            // 1. invoke-level headers
            // 2. client-level headers
            // 3. default Content-Type header
            headers: Object.assign(Object.assign(Object.assign({}, _headers), this.headers), headers),
            body
          }).catch((fetchError) => {
            throw new FunctionsFetchError(fetchError);
          });
          const isRelayError = response.headers.get("x-relay-error");
          if (isRelayError && isRelayError === "true") {
            throw new FunctionsRelayError(response);
          }
          if (!response.ok) {
            throw new FunctionsHttpError(response);
          }
          let responseType = ((_a = response.headers.get("Content-Type")) !== null && _a !== void 0 ? _a : "text/plain").split(";")[0].trim();
          let data;
          if (responseType === "application/json") {
            data = yield response.json();
          } else if (responseType === "application/octet-stream") {
            data = yield response.blob();
          } else if (responseType === "text/event-stream") {
            data = response;
          } else if (responseType === "multipart/form-data") {
            data = yield response.formData();
          } else {
            data = yield response.text();
          }
          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      });
    }
  };

  // node_modules/@supabase/postgrest-js/dist/esm/wrapper.mjs
  var import_cjs = __toESM(require_cjs(), 1);
  var {
    PostgrestClient,
    PostgrestQueryBuilder,
    PostgrestFilterBuilder,
    PostgrestTransformBuilder,
    PostgrestBuilder,
    PostgrestError
  } = import_cjs.default;

  // node_modules/@supabase/realtime-js/dist/module/lib/version.js
  var version = "2.11.2";

  // node_modules/@supabase/realtime-js/dist/module/lib/constants.js
  var DEFAULT_HEADERS = { "X-Client-Info": `realtime-js/${version}` };
  var VSN = "1.0.0";
  var DEFAULT_TIMEOUT = 1e4;
  var WS_CLOSE_NORMAL = 1e3;
  var SOCKET_STATES;
  (function(SOCKET_STATES2) {
    SOCKET_STATES2[SOCKET_STATES2["connecting"] = 0] = "connecting";
    SOCKET_STATES2[SOCKET_STATES2["open"] = 1] = "open";
    SOCKET_STATES2[SOCKET_STATES2["closing"] = 2] = "closing";
    SOCKET_STATES2[SOCKET_STATES2["closed"] = 3] = "closed";
  })(SOCKET_STATES || (SOCKET_STATES = {}));
  var CHANNEL_STATES;
  (function(CHANNEL_STATES2) {
    CHANNEL_STATES2["closed"] = "closed";
    CHANNEL_STATES2["errored"] = "errored";
    CHANNEL_STATES2["joined"] = "joined";
    CHANNEL_STATES2["joining"] = "joining";
    CHANNEL_STATES2["leaving"] = "leaving";
  })(CHANNEL_STATES || (CHANNEL_STATES = {}));
  var CHANNEL_EVENTS;
  (function(CHANNEL_EVENTS2) {
    CHANNEL_EVENTS2["close"] = "phx_close";
    CHANNEL_EVENTS2["error"] = "phx_error";
    CHANNEL_EVENTS2["join"] = "phx_join";
    CHANNEL_EVENTS2["reply"] = "phx_reply";
    CHANNEL_EVENTS2["leave"] = "phx_leave";
    CHANNEL_EVENTS2["access_token"] = "access_token";
  })(CHANNEL_EVENTS || (CHANNEL_EVENTS = {}));
  var TRANSPORTS;
  (function(TRANSPORTS2) {
    TRANSPORTS2["websocket"] = "websocket";
  })(TRANSPORTS || (TRANSPORTS = {}));
  var CONNECTION_STATE;
  (function(CONNECTION_STATE2) {
    CONNECTION_STATE2["Connecting"] = "connecting";
    CONNECTION_STATE2["Open"] = "open";
    CONNECTION_STATE2["Closing"] = "closing";
    CONNECTION_STATE2["Closed"] = "closed";
  })(CONNECTION_STATE || (CONNECTION_STATE = {}));

  // node_modules/@supabase/realtime-js/dist/module/lib/serializer.js
  var Serializer = class {
    constructor() {
      this.HEADER_LENGTH = 1;
    }
    decode(rawPayload, callback) {
      if (rawPayload.constructor === ArrayBuffer) {
        return callback(this._binaryDecode(rawPayload));
      }
      if (typeof rawPayload === "string") {
        return callback(JSON.parse(rawPayload));
      }
      return callback({});
    }
    _binaryDecode(buffer) {
      const view = new DataView(buffer);
      const decoder = new TextDecoder();
      return this._decodeBroadcast(buffer, view, decoder);
    }
    _decodeBroadcast(buffer, view, decoder) {
      const topicSize = view.getUint8(1);
      const eventSize = view.getUint8(2);
      let offset = this.HEADER_LENGTH + 2;
      const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
      offset = offset + topicSize;
      const event = decoder.decode(buffer.slice(offset, offset + eventSize));
      offset = offset + eventSize;
      const data = JSON.parse(decoder.decode(buffer.slice(offset, buffer.byteLength)));
      return { ref: null, topic, event, payload: data };
    }
  };

  // node_modules/@supabase/realtime-js/dist/module/lib/timer.js
  var Timer = class {
    constructor(callback, timerCalc) {
      this.callback = callback;
      this.timerCalc = timerCalc;
      this.timer = void 0;
      this.tries = 0;
      this.callback = callback;
      this.timerCalc = timerCalc;
    }
    reset() {
      this.tries = 0;
      clearTimeout(this.timer);
    }
    // Cancels any previous scheduleTimeout and schedules callback
    scheduleTimeout() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.tries = this.tries + 1;
        this.callback();
      }, this.timerCalc(this.tries + 1));
    }
  };

  // node_modules/@supabase/realtime-js/dist/module/lib/transformers.js
  var PostgresTypes;
  (function(PostgresTypes2) {
    PostgresTypes2["abstime"] = "abstime";
    PostgresTypes2["bool"] = "bool";
    PostgresTypes2["date"] = "date";
    PostgresTypes2["daterange"] = "daterange";
    PostgresTypes2["float4"] = "float4";
    PostgresTypes2["float8"] = "float8";
    PostgresTypes2["int2"] = "int2";
    PostgresTypes2["int4"] = "int4";
    PostgresTypes2["int4range"] = "int4range";
    PostgresTypes2["int8"] = "int8";
    PostgresTypes2["int8range"] = "int8range";
    PostgresTypes2["json"] = "json";
    PostgresTypes2["jsonb"] = "jsonb";
    PostgresTypes2["money"] = "money";
    PostgresTypes2["numeric"] = "numeric";
    PostgresTypes2["oid"] = "oid";
    PostgresTypes2["reltime"] = "reltime";
    PostgresTypes2["text"] = "text";
    PostgresTypes2["time"] = "time";
    PostgresTypes2["timestamp"] = "timestamp";
    PostgresTypes2["timestamptz"] = "timestamptz";
    PostgresTypes2["timetz"] = "timetz";
    PostgresTypes2["tsrange"] = "tsrange";
    PostgresTypes2["tstzrange"] = "tstzrange";
  })(PostgresTypes || (PostgresTypes = {}));
  var convertChangeData = (columns, record, options = {}) => {
    var _a;
    const skipTypes = (_a = options.skipTypes) !== null && _a !== void 0 ? _a : [];
    return Object.keys(record).reduce((acc, rec_key) => {
      acc[rec_key] = convertColumn(rec_key, columns, record, skipTypes);
      return acc;
    }, {});
  };
  var convertColumn = (columnName, columns, record, skipTypes) => {
    const column = columns.find((x) => x.name === columnName);
    const colType = column === null || column === void 0 ? void 0 : column.type;
    const value = record[columnName];
    if (colType && !skipTypes.includes(colType)) {
      return convertCell(colType, value);
    }
    return noop(value);
  };
  var convertCell = (type, value) => {
    if (type.charAt(0) === "_") {
      const dataType = type.slice(1, type.length);
      return toArray(value, dataType);
    }
    switch (type) {
      case PostgresTypes.bool:
        return toBoolean(value);
      case PostgresTypes.float4:
      case PostgresTypes.float8:
      case PostgresTypes.int2:
      case PostgresTypes.int4:
      case PostgresTypes.int8:
      case PostgresTypes.numeric:
      case PostgresTypes.oid:
        return toNumber(value);
      case PostgresTypes.json:
      case PostgresTypes.jsonb:
        return toJson(value);
      case PostgresTypes.timestamp:
        return toTimestampString(value);
      // Format to be consistent with PostgREST
      case PostgresTypes.abstime:
      // To allow users to cast it based on Timezone
      case PostgresTypes.date:
      // To allow users to cast it based on Timezone
      case PostgresTypes.daterange:
      case PostgresTypes.int4range:
      case PostgresTypes.int8range:
      case PostgresTypes.money:
      case PostgresTypes.reltime:
      // To allow users to cast it based on Timezone
      case PostgresTypes.text:
      case PostgresTypes.time:
      // To allow users to cast it based on Timezone
      case PostgresTypes.timestamptz:
      // To allow users to cast it based on Timezone
      case PostgresTypes.timetz:
      // To allow users to cast it based on Timezone
      case PostgresTypes.tsrange:
      case PostgresTypes.tstzrange:
        return noop(value);
      default:
        return noop(value);
    }
  };
  var noop = (value) => {
    return value;
  };
  var toBoolean = (value) => {
    switch (value) {
      case "t":
        return true;
      case "f":
        return false;
      default:
        return value;
    }
  };
  var toNumber = (value) => {
    if (typeof value === "string") {
      const parsedValue = parseFloat(value);
      if (!Number.isNaN(parsedValue)) {
        return parsedValue;
      }
    }
    return value;
  };
  var toJson = (value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (error) {
        console.log(`JSON parse error: ${error}`);
        return value;
      }
    }
    return value;
  };
  var toArray = (value, type) => {
    if (typeof value !== "string") {
      return value;
    }
    const lastIdx = value.length - 1;
    const closeBrace = value[lastIdx];
    const openBrace = value[0];
    if (openBrace === "{" && closeBrace === "}") {
      let arr;
      const valTrim = value.slice(1, lastIdx);
      try {
        arr = JSON.parse("[" + valTrim + "]");
      } catch (_) {
        arr = valTrim ? valTrim.split(",") : [];
      }
      return arr.map((val) => convertCell(type, val));
    }
    return value;
  };
  var toTimestampString = (value) => {
    if (typeof value === "string") {
      return value.replace(" ", "T");
    }
    return value;
  };
  var httpEndpointURL = (socketUrl) => {
    let url = socketUrl;
    url = url.replace(/^ws/i, "http");
    url = url.replace(/(\/socket\/websocket|\/socket|\/websocket)\/?$/i, "");
    return url.replace(/\/+$/, "");
  };

  // node_modules/@supabase/realtime-js/dist/module/lib/push.js
  var Push = class {
    /**
     * Initializes the Push
     *
     * @param channel The Channel
     * @param event The event, for example `"phx_join"`
     * @param payload The payload, for example `{user_id: 123}`
     * @param timeout The push timeout in milliseconds
     */
    constructor(channel, event, payload = {}, timeout = DEFAULT_TIMEOUT) {
      this.channel = channel;
      this.event = event;
      this.payload = payload;
      this.timeout = timeout;
      this.sent = false;
      this.timeoutTimer = void 0;
      this.ref = "";
      this.receivedResp = null;
      this.recHooks = [];
      this.refEvent = null;
    }
    resend(timeout) {
      this.timeout = timeout;
      this._cancelRefEvent();
      this.ref = "";
      this.refEvent = null;
      this.receivedResp = null;
      this.sent = false;
      this.send();
    }
    send() {
      if (this._hasReceived("timeout")) {
        return;
      }
      this.startTimeout();
      this.sent = true;
      this.channel.socket.push({
        topic: this.channel.topic,
        event: this.event,
        payload: this.payload,
        ref: this.ref,
        join_ref: this.channel._joinRef()
      });
    }
    updatePayload(payload) {
      this.payload = Object.assign(Object.assign({}, this.payload), payload);
    }
    receive(status, callback) {
      var _a;
      if (this._hasReceived(status)) {
        callback((_a = this.receivedResp) === null || _a === void 0 ? void 0 : _a.response);
      }
      this.recHooks.push({ status, callback });
      return this;
    }
    startTimeout() {
      if (this.timeoutTimer) {
        return;
      }
      this.ref = this.channel.socket._makeRef();
      this.refEvent = this.channel._replyEventName(this.ref);
      const callback = (payload) => {
        this._cancelRefEvent();
        this._cancelTimeout();
        this.receivedResp = payload;
        this._matchReceive(payload);
      };
      this.channel._on(this.refEvent, {}, callback);
      this.timeoutTimer = setTimeout(() => {
        this.trigger("timeout", {});
      }, this.timeout);
    }
    trigger(status, response) {
      if (this.refEvent)
        this.channel._trigger(this.refEvent, { status, response });
    }
    destroy() {
      this._cancelRefEvent();
      this._cancelTimeout();
    }
    _cancelRefEvent() {
      if (!this.refEvent) {
        return;
      }
      this.channel._off(this.refEvent, {});
    }
    _cancelTimeout() {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = void 0;
    }
    _matchReceive({ status, response }) {
      this.recHooks.filter((h) => h.status === status).forEach((h) => h.callback(response));
    }
    _hasReceived(status) {
      return this.receivedResp && this.receivedResp.status === status;
    }
  };

  // node_modules/@supabase/realtime-js/dist/module/RealtimePresence.js
  var REALTIME_PRESENCE_LISTEN_EVENTS;
  (function(REALTIME_PRESENCE_LISTEN_EVENTS2) {
    REALTIME_PRESENCE_LISTEN_EVENTS2["SYNC"] = "sync";
    REALTIME_PRESENCE_LISTEN_EVENTS2["JOIN"] = "join";
    REALTIME_PRESENCE_LISTEN_EVENTS2["LEAVE"] = "leave";
  })(REALTIME_PRESENCE_LISTEN_EVENTS || (REALTIME_PRESENCE_LISTEN_EVENTS = {}));
  var RealtimePresence = class _RealtimePresence {
    /**
     * Initializes the Presence.
     *
     * @param channel - The RealtimeChannel
     * @param opts - The options,
     *        for example `{events: {state: 'state', diff: 'diff'}}`
     */
    constructor(channel, opts) {
      this.channel = channel;
      this.state = {};
      this.pendingDiffs = [];
      this.joinRef = null;
      this.caller = {
        onJoin: () => {
        },
        onLeave: () => {
        },
        onSync: () => {
        }
      };
      const events = (opts === null || opts === void 0 ? void 0 : opts.events) || {
        state: "presence_state",
        diff: "presence_diff"
      };
      this.channel._on(events.state, {}, (newState) => {
        const { onJoin, onLeave, onSync } = this.caller;
        this.joinRef = this.channel._joinRef();
        this.state = _RealtimePresence.syncState(this.state, newState, onJoin, onLeave);
        this.pendingDiffs.forEach((diff) => {
          this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
        });
        this.pendingDiffs = [];
        onSync();
      });
      this.channel._on(events.diff, {}, (diff) => {
        const { onJoin, onLeave, onSync } = this.caller;
        if (this.inPendingSyncState()) {
          this.pendingDiffs.push(diff);
        } else {
          this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
          onSync();
        }
      });
      this.onJoin((key, currentPresences, newPresences) => {
        this.channel._trigger("presence", {
          event: "join",
          key,
          currentPresences,
          newPresences
        });
      });
      this.onLeave((key, currentPresences, leftPresences) => {
        this.channel._trigger("presence", {
          event: "leave",
          key,
          currentPresences,
          leftPresences
        });
      });
      this.onSync(() => {
        this.channel._trigger("presence", { event: "sync" });
      });
    }
    /**
     * Used to sync the list of presences on the server with the
     * client's state.
     *
     * An optional `onJoin` and `onLeave` callback can be provided to
     * react to changes in the client's local presences across
     * disconnects and reconnects with the server.
     *
     * @internal
     */
    static syncState(currentState, newState, onJoin, onLeave) {
      const state = this.cloneDeep(currentState);
      const transformedState = this.transformState(newState);
      const joins = {};
      const leaves = {};
      this.map(state, (key, presences) => {
        if (!transformedState[key]) {
          leaves[key] = presences;
        }
      });
      this.map(transformedState, (key, newPresences) => {
        const currentPresences = state[key];
        if (currentPresences) {
          const newPresenceRefs = newPresences.map((m) => m.presence_ref);
          const curPresenceRefs = currentPresences.map((m) => m.presence_ref);
          const joinedPresences = newPresences.filter((m) => curPresenceRefs.indexOf(m.presence_ref) < 0);
          const leftPresences = currentPresences.filter((m) => newPresenceRefs.indexOf(m.presence_ref) < 0);
          if (joinedPresences.length > 0) {
            joins[key] = joinedPresences;
          }
          if (leftPresences.length > 0) {
            leaves[key] = leftPresences;
          }
        } else {
          joins[key] = newPresences;
        }
      });
      return this.syncDiff(state, { joins, leaves }, onJoin, onLeave);
    }
    /**
     * Used to sync a diff of presence join and leave events from the
     * server, as they happen.
     *
     * Like `syncState`, `syncDiff` accepts optional `onJoin` and
     * `onLeave` callbacks to react to a user joining or leaving from a
     * device.
     *
     * @internal
     */
    static syncDiff(state, diff, onJoin, onLeave) {
      const { joins, leaves } = {
        joins: this.transformState(diff.joins),
        leaves: this.transformState(diff.leaves)
      };
      if (!onJoin) {
        onJoin = () => {
        };
      }
      if (!onLeave) {
        onLeave = () => {
        };
      }
      this.map(joins, (key, newPresences) => {
        var _a;
        const currentPresences = (_a = state[key]) !== null && _a !== void 0 ? _a : [];
        state[key] = this.cloneDeep(newPresences);
        if (currentPresences.length > 0) {
          const joinedPresenceRefs = state[key].map((m) => m.presence_ref);
          const curPresences = currentPresences.filter((m) => joinedPresenceRefs.indexOf(m.presence_ref) < 0);
          state[key].unshift(...curPresences);
        }
        onJoin(key, currentPresences, newPresences);
      });
      this.map(leaves, (key, leftPresences) => {
        let currentPresences = state[key];
        if (!currentPresences)
          return;
        const presenceRefsToRemove = leftPresences.map((m) => m.presence_ref);
        currentPresences = currentPresences.filter((m) => presenceRefsToRemove.indexOf(m.presence_ref) < 0);
        state[key] = currentPresences;
        onLeave(key, currentPresences, leftPresences);
        if (currentPresences.length === 0)
          delete state[key];
      });
      return state;
    }
    /** @internal */
    static map(obj, func) {
      return Object.getOwnPropertyNames(obj).map((key) => func(key, obj[key]));
    }
    /**
     * Remove 'metas' key
     * Change 'phx_ref' to 'presence_ref'
     * Remove 'phx_ref' and 'phx_ref_prev'
     *
     * @example
     * // returns {
     *  abc123: [
     *    { presence_ref: '2', user_id: 1 },
     *    { presence_ref: '3', user_id: 2 }
     *  ]
     * }
     * RealtimePresence.transformState({
     *  abc123: {
     *    metas: [
     *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
     *      { phx_ref: '3', user_id: 2 }
     *    ]
     *  }
     * })
     *
     * @internal
     */
    static transformState(state) {
      state = this.cloneDeep(state);
      return Object.getOwnPropertyNames(state).reduce((newState, key) => {
        const presences = state[key];
        if ("metas" in presences) {
          newState[key] = presences.metas.map((presence) => {
            presence["presence_ref"] = presence["phx_ref"];
            delete presence["phx_ref"];
            delete presence["phx_ref_prev"];
            return presence;
          });
        } else {
          newState[key] = presences;
        }
        return newState;
      }, {});
    }
    /** @internal */
    static cloneDeep(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
    /** @internal */
    onJoin(callback) {
      this.caller.onJoin = callback;
    }
    /** @internal */
    onLeave(callback) {
      this.caller.onLeave = callback;
    }
    /** @internal */
    onSync(callback) {
      this.caller.onSync = callback;
    }
    /** @internal */
    inPendingSyncState() {
      return !this.joinRef || this.joinRef !== this.channel._joinRef();
    }
  };

  // node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.js
  var REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
  (function(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2) {
    REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["ALL"] = "*";
    REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["INSERT"] = "INSERT";
    REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["UPDATE"] = "UPDATE";
    REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["DELETE"] = "DELETE";
  })(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT || (REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {}));
  var REALTIME_LISTEN_TYPES;
  (function(REALTIME_LISTEN_TYPES2) {
    REALTIME_LISTEN_TYPES2["BROADCAST"] = "broadcast";
    REALTIME_LISTEN_TYPES2["PRESENCE"] = "presence";
    REALTIME_LISTEN_TYPES2["POSTGRES_CHANGES"] = "postgres_changes";
    REALTIME_LISTEN_TYPES2["SYSTEM"] = "system";
  })(REALTIME_LISTEN_TYPES || (REALTIME_LISTEN_TYPES = {}));
  var REALTIME_SUBSCRIBE_STATES;
  (function(REALTIME_SUBSCRIBE_STATES2) {
    REALTIME_SUBSCRIBE_STATES2["SUBSCRIBED"] = "SUBSCRIBED";
    REALTIME_SUBSCRIBE_STATES2["TIMED_OUT"] = "TIMED_OUT";
    REALTIME_SUBSCRIBE_STATES2["CLOSED"] = "CLOSED";
    REALTIME_SUBSCRIBE_STATES2["CHANNEL_ERROR"] = "CHANNEL_ERROR";
  })(REALTIME_SUBSCRIBE_STATES || (REALTIME_SUBSCRIBE_STATES = {}));
  var RealtimeChannel = class _RealtimeChannel {
    constructor(topic, params = { config: {} }, socket) {
      this.topic = topic;
      this.params = params;
      this.socket = socket;
      this.bindings = {};
      this.state = CHANNEL_STATES.closed;
      this.joinedOnce = false;
      this.pushBuffer = [];
      this.subTopic = topic.replace(/^realtime:/i, "");
      this.params.config = Object.assign({
        broadcast: { ack: false, self: false },
        presence: { key: "" },
        private: false
      }, params.config);
      this.timeout = this.socket.timeout;
      this.joinPush = new Push(this, CHANNEL_EVENTS.join, this.params, this.timeout);
      this.rejoinTimer = new Timer(() => this._rejoinUntilConnected(), this.socket.reconnectAfterMs);
      this.joinPush.receive("ok", () => {
        this.state = CHANNEL_STATES.joined;
        this.rejoinTimer.reset();
        this.pushBuffer.forEach((pushEvent) => pushEvent.send());
        this.pushBuffer = [];
      });
      this._onClose(() => {
        this.rejoinTimer.reset();
        this.socket.log("channel", `close ${this.topic} ${this._joinRef()}`);
        this.state = CHANNEL_STATES.closed;
        this.socket._remove(this);
      });
      this._onError((reason) => {
        if (this._isLeaving() || this._isClosed()) {
          return;
        }
        this.socket.log("channel", `error ${this.topic}`, reason);
        this.state = CHANNEL_STATES.errored;
        this.rejoinTimer.scheduleTimeout();
      });
      this.joinPush.receive("timeout", () => {
        if (!this._isJoining()) {
          return;
        }
        this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout);
        this.state = CHANNEL_STATES.errored;
        this.rejoinTimer.scheduleTimeout();
      });
      this._on(CHANNEL_EVENTS.reply, {}, (payload, ref) => {
        this._trigger(this._replyEventName(ref), payload);
      });
      this.presence = new RealtimePresence(this);
      this.broadcastEndpointURL = httpEndpointURL(this.socket.endPoint) + "/api/broadcast";
      this.private = this.params.config.private || false;
    }
    /** Subscribe registers your client with the server */
    subscribe(callback, timeout = this.timeout) {
      var _a, _b;
      if (!this.socket.isConnected()) {
        this.socket.connect();
      }
      if (this.joinedOnce) {
        throw `tried to subscribe multiple times. 'subscribe' can only be called a single time per channel instance`;
      } else {
        const { config: { broadcast, presence, private: isPrivate } } = this.params;
        this._onError((e) => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, e));
        this._onClose(() => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CLOSED));
        const accessTokenPayload = {};
        const config = {
          broadcast,
          presence,
          postgres_changes: (_b = (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.map((r) => r.filter)) !== null && _b !== void 0 ? _b : [],
          private: isPrivate
        };
        if (this.socket.accessTokenValue) {
          accessTokenPayload.access_token = this.socket.accessTokenValue;
        }
        this.updateJoinPayload(Object.assign({ config }, accessTokenPayload));
        this.joinedOnce = true;
        this._rejoin(timeout);
        this.joinPush.receive("ok", async ({ postgres_changes }) => {
          var _a2;
          this.socket.setAuth();
          if (postgres_changes === void 0) {
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
            return;
          } else {
            const clientPostgresBindings = this.bindings.postgres_changes;
            const bindingsLen = (_a2 = clientPostgresBindings === null || clientPostgresBindings === void 0 ? void 0 : clientPostgresBindings.length) !== null && _a2 !== void 0 ? _a2 : 0;
            const newPostgresBindings = [];
            for (let i = 0; i < bindingsLen; i++) {
              const clientPostgresBinding = clientPostgresBindings[i];
              const { filter: { event, schema, table, filter } } = clientPostgresBinding;
              const serverPostgresFilter = postgres_changes && postgres_changes[i];
              if (serverPostgresFilter && serverPostgresFilter.event === event && serverPostgresFilter.schema === schema && serverPostgresFilter.table === table && serverPostgresFilter.filter === filter) {
                newPostgresBindings.push(Object.assign(Object.assign({}, clientPostgresBinding), { id: serverPostgresFilter.id }));
              } else {
                this.unsubscribe();
                callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
                return;
              }
            }
            this.bindings.postgres_changes = newPostgresBindings;
            callback && callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
            return;
          }
        }).receive("error", (error) => {
          callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error(JSON.stringify(Object.values(error).join(", ") || "error")));
          return;
        }).receive("timeout", () => {
          callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
          return;
        });
      }
      return this;
    }
    presenceState() {
      return this.presence.state;
    }
    async track(payload, opts = {}) {
      return await this.send({
        type: "presence",
        event: "track",
        payload
      }, opts.timeout || this.timeout);
    }
    async untrack(opts = {}) {
      return await this.send({
        type: "presence",
        event: "untrack"
      }, opts);
    }
    on(type, filter, callback) {
      return this._on(type, filter, callback);
    }
    /**
     * Sends a message into the channel.
     *
     * @param args Arguments to send to channel
     * @param args.type The type of event to send
     * @param args.event The name of the event being sent
     * @param args.payload Payload to be sent
     * @param opts Options to be used during the send process
     */
    async send(args, opts = {}) {
      var _a, _b;
      if (!this._canPush() && args.type === "broadcast") {
        const { event, payload: endpoint_payload } = args;
        const authorization = this.socket.accessTokenValue ? `Bearer ${this.socket.accessTokenValue}` : "";
        const options = {
          method: "POST",
          headers: {
            Authorization: authorization,
            apikey: this.socket.apiKey ? this.socket.apiKey : "",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: [
              {
                topic: this.subTopic,
                event,
                payload: endpoint_payload,
                private: this.private
              }
            ]
          })
        };
        try {
          const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
          await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
          return response.ok ? "ok" : "error";
        } catch (error) {
          if (error.name === "AbortError") {
            return "timed out";
          } else {
            return "error";
          }
        }
      } else {
        return new Promise((resolve) => {
          var _a2, _b2, _c;
          const push = this._push(args.type, args, opts.timeout || this.timeout);
          if (args.type === "broadcast" && !((_c = (_b2 = (_a2 = this.params) === null || _a2 === void 0 ? void 0 : _a2.config) === null || _b2 === void 0 ? void 0 : _b2.broadcast) === null || _c === void 0 ? void 0 : _c.ack)) {
            resolve("ok");
          }
          push.receive("ok", () => resolve("ok"));
          push.receive("error", () => resolve("error"));
          push.receive("timeout", () => resolve("timed out"));
        });
      }
    }
    updateJoinPayload(payload) {
      this.joinPush.updatePayload(payload);
    }
    /**
     * Leaves the channel.
     *
     * Unsubscribes from server events, and instructs channel to terminate on server.
     * Triggers onClose() hooks.
     *
     * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
     * channel.unsubscribe().receive("ok", () => alert("left!") )
     */
    unsubscribe(timeout = this.timeout) {
      this.state = CHANNEL_STATES.leaving;
      const onClose = () => {
        this.socket.log("channel", `leave ${this.topic}`);
        this._trigger(CHANNEL_EVENTS.close, "leave", this._joinRef());
      };
      this.rejoinTimer.reset();
      this.joinPush.destroy();
      return new Promise((resolve) => {
        const leavePush = new Push(this, CHANNEL_EVENTS.leave, {}, timeout);
        leavePush.receive("ok", () => {
          onClose();
          resolve("ok");
        }).receive("timeout", () => {
          onClose();
          resolve("timed out");
        }).receive("error", () => {
          resolve("error");
        });
        leavePush.send();
        if (!this._canPush()) {
          leavePush.trigger("ok", {});
        }
      });
    }
    /** @internal */
    async _fetchWithTimeout(url, options, timeout) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const response = await this.socket.fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
      clearTimeout(id);
      return response;
    }
    /** @internal */
    _push(event, payload, timeout = this.timeout) {
      if (!this.joinedOnce) {
        throw `tried to push '${event}' to '${this.topic}' before joining. Use channel.subscribe() before pushing events`;
      }
      let pushEvent = new Push(this, event, payload, timeout);
      if (this._canPush()) {
        pushEvent.send();
      } else {
        pushEvent.startTimeout();
        this.pushBuffer.push(pushEvent);
      }
      return pushEvent;
    }
    /**
     * Overridable message hook
     *
     * Receives all events for specialized message handling before dispatching to the channel callbacks.
     * Must return the payload, modified or unmodified.
     *
     * @internal
     */
    _onMessage(_event, payload, _ref) {
      return payload;
    }
    /** @internal */
    _isMember(topic) {
      return this.topic === topic;
    }
    /** @internal */
    _joinRef() {
      return this.joinPush.ref;
    }
    /** @internal */
    _trigger(type, payload, ref) {
      var _a, _b;
      const typeLower = type.toLocaleLowerCase();
      const { close, error, leave, join } = CHANNEL_EVENTS;
      const events = [close, error, leave, join];
      if (ref && events.indexOf(typeLower) >= 0 && ref !== this._joinRef()) {
        return;
      }
      let handledPayload = this._onMessage(typeLower, payload, ref);
      if (payload && !handledPayload) {
        throw "channel onMessage callbacks must return the payload, modified or unmodified";
      }
      if (["insert", "update", "delete"].includes(typeLower)) {
        (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.filter((bind) => {
          var _a2, _b2, _c;
          return ((_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event) === "*" || ((_c = (_b2 = bind.filter) === null || _b2 === void 0 ? void 0 : _b2.event) === null || _c === void 0 ? void 0 : _c.toLocaleLowerCase()) === typeLower;
        }).map((bind) => bind.callback(handledPayload, ref));
      } else {
        (_b = this.bindings[typeLower]) === null || _b === void 0 ? void 0 : _b.filter((bind) => {
          var _a2, _b2, _c, _d, _e, _f;
          if (["broadcast", "presence", "postgres_changes"].includes(typeLower)) {
            if ("id" in bind) {
              const bindId = bind.id;
              const bindEvent = (_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event;
              return bindId && ((_b2 = payload.ids) === null || _b2 === void 0 ? void 0 : _b2.includes(bindId)) && (bindEvent === "*" || (bindEvent === null || bindEvent === void 0 ? void 0 : bindEvent.toLocaleLowerCase()) === ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.type.toLocaleLowerCase()));
            } else {
              const bindEvent = (_e = (_d = bind === null || bind === void 0 ? void 0 : bind.filter) === null || _d === void 0 ? void 0 : _d.event) === null || _e === void 0 ? void 0 : _e.toLocaleLowerCase();
              return bindEvent === "*" || bindEvent === ((_f = payload === null || payload === void 0 ? void 0 : payload.event) === null || _f === void 0 ? void 0 : _f.toLocaleLowerCase());
            }
          } else {
            return bind.type.toLocaleLowerCase() === typeLower;
          }
        }).map((bind) => {
          if (typeof handledPayload === "object" && "ids" in handledPayload) {
            const postgresChanges = handledPayload.data;
            const { schema, table, commit_timestamp, type: type2, errors } = postgresChanges;
            const enrichedPayload = {
              schema,
              table,
              commit_timestamp,
              eventType: type2,
              new: {},
              old: {},
              errors
            };
            handledPayload = Object.assign(Object.assign({}, enrichedPayload), this._getPayloadRecords(postgresChanges));
          }
          bind.callback(handledPayload, ref);
        });
      }
    }
    /** @internal */
    _isClosed() {
      return this.state === CHANNEL_STATES.closed;
    }
    /** @internal */
    _isJoined() {
      return this.state === CHANNEL_STATES.joined;
    }
    /** @internal */
    _isJoining() {
      return this.state === CHANNEL_STATES.joining;
    }
    /** @internal */
    _isLeaving() {
      return this.state === CHANNEL_STATES.leaving;
    }
    /** @internal */
    _replyEventName(ref) {
      return `chan_reply_${ref}`;
    }
    /** @internal */
    _on(type, filter, callback) {
      const typeLower = type.toLocaleLowerCase();
      const binding = {
        type: typeLower,
        filter,
        callback
      };
      if (this.bindings[typeLower]) {
        this.bindings[typeLower].push(binding);
      } else {
        this.bindings[typeLower] = [binding];
      }
      return this;
    }
    /** @internal */
    _off(type, filter) {
      const typeLower = type.toLocaleLowerCase();
      this.bindings[typeLower] = this.bindings[typeLower].filter((bind) => {
        var _a;
        return !(((_a = bind.type) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase()) === typeLower && _RealtimeChannel.isEqual(bind.filter, filter));
      });
      return this;
    }
    /** @internal */
    static isEqual(obj1, obj2) {
      if (Object.keys(obj1).length !== Object.keys(obj2).length) {
        return false;
      }
      for (const k in obj1) {
        if (obj1[k] !== obj2[k]) {
          return false;
        }
      }
      return true;
    }
    /** @internal */
    _rejoinUntilConnected() {
      this.rejoinTimer.scheduleTimeout();
      if (this.socket.isConnected()) {
        this._rejoin();
      }
    }
    /**
     * Registers a callback that will be executed when the channel closes.
     *
     * @internal
     */
    _onClose(callback) {
      this._on(CHANNEL_EVENTS.close, {}, callback);
    }
    /**
     * Registers a callback that will be executed when the channel encounteres an error.
     *
     * @internal
     */
    _onError(callback) {
      this._on(CHANNEL_EVENTS.error, {}, (reason) => callback(reason));
    }
    /**
     * Returns `true` if the socket is connected and the channel has been joined.
     *
     * @internal
     */
    _canPush() {
      return this.socket.isConnected() && this._isJoined();
    }
    /** @internal */
    _rejoin(timeout = this.timeout) {
      if (this._isLeaving()) {
        return;
      }
      this.socket._leaveOpenTopic(this.topic);
      this.state = CHANNEL_STATES.joining;
      this.joinPush.resend(timeout);
    }
    /** @internal */
    _getPayloadRecords(payload) {
      const records = {
        new: {},
        old: {}
      };
      if (payload.type === "INSERT" || payload.type === "UPDATE") {
        records.new = convertChangeData(payload.columns, payload.record);
      }
      if (payload.type === "UPDATE" || payload.type === "DELETE") {
        records.old = convertChangeData(payload.columns, payload.old_record);
      }
      return records;
    }
  };

  // node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js
  var noop2 = () => {
  };
  var NATIVE_WEBSOCKET_AVAILABLE = typeof WebSocket !== "undefined";
  var WORKER_SCRIPT = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
  var RealtimeClient = class {
    /**
     * Initializes the Socket.
     *
     * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
     * @param httpEndpoint The string HTTP endpoint, ie, "https://example.com", "/" (inherited host & protocol)
     * @param options.transport The Websocket Transport, for example WebSocket.
     * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
     * @param options.params The optional params to pass when connecting.
     * @param options.headers The optional headers to pass when connecting.
     * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
     * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
     * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
     * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
     * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
     * @param options.worker Use Web Worker to set a side flow. Defaults to false.
     * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
     */
    constructor(endPoint, options) {
      var _a;
      this.accessTokenValue = null;
      this.apiKey = null;
      this.channels = [];
      this.endPoint = "";
      this.httpEndpoint = "";
      this.headers = DEFAULT_HEADERS;
      this.params = {};
      this.timeout = DEFAULT_TIMEOUT;
      this.heartbeatIntervalMs = 3e4;
      this.heartbeatTimer = void 0;
      this.pendingHeartbeatRef = null;
      this.ref = 0;
      this.logger = noop2;
      this.conn = null;
      this.sendBuffer = [];
      this.serializer = new Serializer();
      this.stateChangeCallbacks = {
        open: [],
        close: [],
        error: [],
        message: []
      };
      this.accessToken = null;
      this._resolveFetch = (customFetch) => {
        let _fetch;
        if (customFetch) {
          _fetch = customFetch;
        } else if (typeof fetch === "undefined") {
          _fetch = (...args) => Promise.resolve().then(() => (init_browser(), browser_exports)).then(({ default: fetch3 }) => fetch3(...args));
        } else {
          _fetch = fetch;
        }
        return (...args) => _fetch(...args);
      };
      this.endPoint = `${endPoint}/${TRANSPORTS.websocket}`;
      this.httpEndpoint = httpEndpointURL(endPoint);
      if (options === null || options === void 0 ? void 0 : options.transport) {
        this.transport = options.transport;
      } else {
        this.transport = null;
      }
      if (options === null || options === void 0 ? void 0 : options.params)
        this.params = options.params;
      if (options === null || options === void 0 ? void 0 : options.headers)
        this.headers = Object.assign(Object.assign({}, this.headers), options.headers);
      if (options === null || options === void 0 ? void 0 : options.timeout)
        this.timeout = options.timeout;
      if (options === null || options === void 0 ? void 0 : options.logger)
        this.logger = options.logger;
      if (options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs)
        this.heartbeatIntervalMs = options.heartbeatIntervalMs;
      const accessTokenValue = (_a = options === null || options === void 0 ? void 0 : options.params) === null || _a === void 0 ? void 0 : _a.apikey;
      if (accessTokenValue) {
        this.accessTokenValue = accessTokenValue;
        this.apiKey = accessTokenValue;
      }
      this.reconnectAfterMs = (options === null || options === void 0 ? void 0 : options.reconnectAfterMs) ? options.reconnectAfterMs : (tries) => {
        return [1e3, 2e3, 5e3, 1e4][tries - 1] || 1e4;
      };
      this.encode = (options === null || options === void 0 ? void 0 : options.encode) ? options.encode : (payload, callback) => {
        return callback(JSON.stringify(payload));
      };
      this.decode = (options === null || options === void 0 ? void 0 : options.decode) ? options.decode : this.serializer.decode.bind(this.serializer);
      this.reconnectTimer = new Timer(async () => {
        this.disconnect();
        this.connect();
      }, this.reconnectAfterMs);
      this.fetch = this._resolveFetch(options === null || options === void 0 ? void 0 : options.fetch);
      if (options === null || options === void 0 ? void 0 : options.worker) {
        if (typeof window !== "undefined" && !window.Worker) {
          throw new Error("Web Worker is not supported");
        }
        this.worker = (options === null || options === void 0 ? void 0 : options.worker) || false;
        this.workerUrl = options === null || options === void 0 ? void 0 : options.workerUrl;
      }
      this.accessToken = (options === null || options === void 0 ? void 0 : options.accessToken) || null;
    }
    /**
     * Connects the socket, unless already connected.
     */
    connect() {
      if (this.conn) {
        return;
      }
      if (this.transport) {
        this.conn = new this.transport(this.endpointURL(), void 0, {
          headers: this.headers
        });
        return;
      }
      if (NATIVE_WEBSOCKET_AVAILABLE) {
        this.conn = new WebSocket(this.endpointURL());
        this.setupConnection();
        return;
      }
      this.conn = new WSWebSocketDummy(this.endpointURL(), void 0, {
        close: () => {
          this.conn = null;
        }
      });
      Promise.resolve().then(() => __toESM(require_browser())).then(({ default: WS }) => {
        this.conn = new WS(this.endpointURL(), void 0, {
          headers: this.headers
        });
        this.setupConnection();
      });
    }
    /**
     * Returns the URL of the websocket.
     * @returns string The URL of the websocket.
     */
    endpointURL() {
      return this._appendParams(this.endPoint, Object.assign({}, this.params, { vsn: VSN }));
    }
    /**
     * Disconnects the socket.
     *
     * @param code A numeric status code to send on disconnect.
     * @param reason A custom reason for the disconnect.
     */
    disconnect(code, reason) {
      if (this.conn) {
        this.conn.onclose = function() {
        };
        if (code) {
          this.conn.close(code, reason !== null && reason !== void 0 ? reason : "");
        } else {
          this.conn.close();
        }
        this.conn = null;
        this.heartbeatTimer && clearInterval(this.heartbeatTimer);
        this.reconnectTimer.reset();
      }
    }
    /**
     * Returns all created channels
     */
    getChannels() {
      return this.channels;
    }
    /**
     * Unsubscribes and removes a single channel
     * @param channel A RealtimeChannel instance
     */
    async removeChannel(channel) {
      const status = await channel.unsubscribe();
      if (this.channels.length === 0) {
        this.disconnect();
      }
      return status;
    }
    /**
     * Unsubscribes and removes all channels
     */
    async removeAllChannels() {
      const values_1 = await Promise.all(this.channels.map((channel) => channel.unsubscribe()));
      this.disconnect();
      return values_1;
    }
    /**
     * Logs the message.
     *
     * For customized logging, `this.logger` can be overridden.
     */
    log(kind, msg, data) {
      this.logger(kind, msg, data);
    }
    /**
     * Returns the current state of the socket.
     */
    connectionState() {
      switch (this.conn && this.conn.readyState) {
        case SOCKET_STATES.connecting:
          return CONNECTION_STATE.Connecting;
        case SOCKET_STATES.open:
          return CONNECTION_STATE.Open;
        case SOCKET_STATES.closing:
          return CONNECTION_STATE.Closing;
        default:
          return CONNECTION_STATE.Closed;
      }
    }
    /**
     * Returns `true` is the connection is open.
     */
    isConnected() {
      return this.connectionState() === CONNECTION_STATE.Open;
    }
    channel(topic, params = { config: {} }) {
      const chan = new RealtimeChannel(`realtime:${topic}`, params, this);
      this.channels.push(chan);
      return chan;
    }
    /**
     * Push out a message if the socket is connected.
     *
     * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
     */
    push(data) {
      const { topic, event, payload, ref } = data;
      const callback = () => {
        this.encode(data, (result) => {
          var _a;
          (_a = this.conn) === null || _a === void 0 ? void 0 : _a.send(result);
        });
      };
      this.log("push", `${topic} ${event} (${ref})`, payload);
      if (this.isConnected()) {
        callback();
      } else {
        this.sendBuffer.push(callback);
      }
    }
    /**
     * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
     *
     * If param is null it will use the `accessToken` callback function or the token set on the client.
     *
     * On callback used, it will set the value of the token internal to the client.
     *
     * @param token A JWT string to override the token set on the client.
     */
    async setAuth(token = null) {
      let tokenToSend = token || this.accessToken && await this.accessToken() || this.accessTokenValue;
      if (tokenToSend) {
        let parsed = null;
        try {
          parsed = JSON.parse(atob(tokenToSend.split(".")[1]));
        } catch (_error) {
        }
        if (parsed && parsed.exp) {
          let now = Math.floor(Date.now() / 1e3);
          let valid = now - parsed.exp < 0;
          if (!valid) {
            this.log("auth", `InvalidJWTToken: Invalid value for JWT claim "exp" with value ${parsed.exp}`);
            return Promise.reject(`InvalidJWTToken: Invalid value for JWT claim "exp" with value ${parsed.exp}`);
          }
        }
        this.accessTokenValue = tokenToSend;
        this.channels.forEach((channel) => {
          tokenToSend && channel.updateJoinPayload({ access_token: tokenToSend });
          if (channel.joinedOnce && channel._isJoined()) {
            channel._push(CHANNEL_EVENTS.access_token, {
              access_token: tokenToSend
            });
          }
        });
      }
    }
    /**
     * Sends a heartbeat message if the socket is connected.
     */
    async sendHeartbeat() {
      var _a;
      if (!this.isConnected()) {
        return;
      }
      if (this.pendingHeartbeatRef) {
        this.pendingHeartbeatRef = null;
        this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
        (_a = this.conn) === null || _a === void 0 ? void 0 : _a.close(WS_CLOSE_NORMAL, "hearbeat timeout");
        return;
      }
      this.pendingHeartbeatRef = this._makeRef();
      this.push({
        topic: "phoenix",
        event: "heartbeat",
        payload: {},
        ref: this.pendingHeartbeatRef
      });
      this.setAuth();
    }
    /**
     * Flushes send buffer
     */
    flushSendBuffer() {
      if (this.isConnected() && this.sendBuffer.length > 0) {
        this.sendBuffer.forEach((callback) => callback());
        this.sendBuffer = [];
      }
    }
    /**
     * Return the next message ref, accounting for overflows
     *
     * @internal
     */
    _makeRef() {
      let newRef = this.ref + 1;
      if (newRef === this.ref) {
        this.ref = 0;
      } else {
        this.ref = newRef;
      }
      return this.ref.toString();
    }
    /**
     * Unsubscribe from channels with the specified topic.
     *
     * @internal
     */
    _leaveOpenTopic(topic) {
      let dupChannel = this.channels.find((c) => c.topic === topic && (c._isJoined() || c._isJoining()));
      if (dupChannel) {
        this.log("transport", `leaving duplicate topic "${topic}"`);
        dupChannel.unsubscribe();
      }
    }
    /**
     * Removes a subscription from the socket.
     *
     * @param channel An open subscription.
     *
     * @internal
     */
    _remove(channel) {
      this.channels = this.channels.filter((c) => c._joinRef() !== channel._joinRef());
    }
    /**
     * Sets up connection handlers.
     *
     * @internal
     */
    setupConnection() {
      if (this.conn) {
        this.conn.binaryType = "arraybuffer";
        this.conn.onopen = () => this._onConnOpen();
        this.conn.onerror = (error) => this._onConnError(error);
        this.conn.onmessage = (event) => this._onConnMessage(event);
        this.conn.onclose = (event) => this._onConnClose(event);
      }
    }
    /** @internal */
    _onConnMessage(rawMessage) {
      this.decode(rawMessage.data, (msg) => {
        let { topic, event, payload, ref } = msg;
        if (ref && ref === this.pendingHeartbeatRef) {
          this.pendingHeartbeatRef = null;
        }
        this.log("receive", `${payload.status || ""} ${topic} ${event} ${ref && "(" + ref + ")" || ""}`, payload);
        this.channels.filter((channel) => channel._isMember(topic)).forEach((channel) => channel._trigger(event, payload, ref));
        this.stateChangeCallbacks.message.forEach((callback) => callback(msg));
      });
    }
    /** @internal */
    async _onConnOpen() {
      this.log("transport", `connected to ${this.endpointURL()}`);
      this.flushSendBuffer();
      this.reconnectTimer.reset();
      if (!this.worker) {
        this.heartbeatTimer && clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
      } else {
        if (this.workerUrl) {
          this.log("worker", `starting worker for from ${this.workerUrl}`);
        } else {
          this.log("worker", `starting default worker`);
        }
        const objectUrl = this._workerObjectUrl(this.workerUrl);
        this.workerRef = new Worker(objectUrl);
        this.workerRef.onerror = (error) => {
          this.log("worker", "worker error", error.message);
          this.workerRef.terminate();
        };
        this.workerRef.onmessage = (event) => {
          if (event.data.event === "keepAlive") {
            this.sendHeartbeat();
          }
        };
        this.workerRef.postMessage({
          event: "start",
          interval: this.heartbeatIntervalMs
        });
      }
      this.stateChangeCallbacks.open.forEach((callback) => callback());
    }
    /** @internal */
    _onConnClose(event) {
      this.log("transport", "close", event);
      this._triggerChanError();
      this.heartbeatTimer && clearInterval(this.heartbeatTimer);
      this.reconnectTimer.scheduleTimeout();
      this.stateChangeCallbacks.close.forEach((callback) => callback(event));
    }
    /** @internal */
    _onConnError(error) {
      this.log("transport", error.message);
      this._triggerChanError();
      this.stateChangeCallbacks.error.forEach((callback) => callback(error));
    }
    /** @internal */
    _triggerChanError() {
      this.channels.forEach((channel) => channel._trigger(CHANNEL_EVENTS.error));
    }
    /** @internal */
    _appendParams(url, params) {
      if (Object.keys(params).length === 0) {
        return url;
      }
      const prefix = url.match(/\?/) ? "&" : "?";
      const query = new URLSearchParams(params);
      return `${url}${prefix}${query}`;
    }
    _workerObjectUrl(url) {
      let result_url;
      if (url) {
        result_url = url;
      } else {
        const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
        result_url = URL.createObjectURL(blob);
      }
      return result_url;
    }
  };
  var WSWebSocketDummy = class {
    constructor(address, _protocols, options) {
      this.binaryType = "arraybuffer";
      this.onclose = () => {
      };
      this.onerror = () => {
      };
      this.onmessage = () => {
      };
      this.onopen = () => {
      };
      this.readyState = SOCKET_STATES.connecting;
      this.send = () => {
      };
      this.url = null;
      this.url = address;
      this.close = options.close;
    }
  };

  // node_modules/@supabase/storage-js/dist/module/lib/errors.js
  var StorageError = class extends Error {
    constructor(message) {
      super(message);
      this.__isStorageError = true;
      this.name = "StorageError";
    }
  };
  function isStorageError(error) {
    return typeof error === "object" && error !== null && "__isStorageError" in error;
  }
  var StorageApiError = class extends StorageError {
    constructor(message, status) {
      super(message);
      this.name = "StorageApiError";
      this.status = status;
    }
    toJSON() {
      return {
        name: this.name,
        message: this.message,
        status: this.status
      };
    }
  };
  var StorageUnknownError = class extends StorageError {
    constructor(message, originalError) {
      super(message);
      this.name = "StorageUnknownError";
      this.originalError = originalError;
    }
  };

  // node_modules/@supabase/storage-js/dist/module/lib/helpers.js
  var __awaiter2 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var resolveFetch2 = (customFetch) => {
    let _fetch;
    if (customFetch) {
      _fetch = customFetch;
    } else if (typeof fetch === "undefined") {
      _fetch = (...args) => Promise.resolve().then(() => (init_browser(), browser_exports)).then(({ default: fetch3 }) => fetch3(...args));
    } else {
      _fetch = fetch;
    }
    return (...args) => _fetch(...args);
  };
  var resolveResponse = () => __awaiter2(void 0, void 0, void 0, function* () {
    if (typeof Response === "undefined") {
      return (yield Promise.resolve().then(() => (init_browser(), browser_exports))).Response;
    }
    return Response;
  });
  var recursiveToCamel = (item) => {
    if (Array.isArray(item)) {
      return item.map((el) => recursiveToCamel(el));
    } else if (typeof item === "function" || item !== Object(item)) {
      return item;
    }
    const result = {};
    Object.entries(item).forEach(([key, value]) => {
      const newKey = key.replace(/([-_][a-z])/gi, (c) => c.toUpperCase().replace(/[-_]/g, ""));
      result[newKey] = recursiveToCamel(value);
    });
    return result;
  };

  // node_modules/@supabase/storage-js/dist/module/lib/fetch.js
  var __awaiter3 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var _getErrorMessage = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
  var handleError = (error, reject, options) => __awaiter3(void 0, void 0, void 0, function* () {
    const Res = yield resolveResponse();
    if (error instanceof Res && !(options === null || options === void 0 ? void 0 : options.noResolveJson)) {
      error.json().then((err) => {
        reject(new StorageApiError(_getErrorMessage(err), error.status || 500));
      }).catch((err) => {
        reject(new StorageUnknownError(_getErrorMessage(err), err));
      });
    } else {
      reject(new StorageUnknownError(_getErrorMessage(error), error));
    }
  });
  var _getRequestParams = (method, options, parameters, body) => {
    const params = { method, headers: (options === null || options === void 0 ? void 0 : options.headers) || {} };
    if (method === "GET") {
      return params;
    }
    params.headers = Object.assign({ "Content-Type": "application/json" }, options === null || options === void 0 ? void 0 : options.headers);
    if (body) {
      params.body = JSON.stringify(body);
    }
    return Object.assign(Object.assign({}, params), parameters);
  };
  function _handleRequest(fetcher, method, url, options, parameters, body) {
    return __awaiter3(this, void 0, void 0, function* () {
      return new Promise((resolve, reject) => {
        fetcher(url, _getRequestParams(method, options, parameters, body)).then((result) => {
          if (!result.ok)
            throw result;
          if (options === null || options === void 0 ? void 0 : options.noResolveJson)
            return result;
          return result.json();
        }).then((data) => resolve(data)).catch((error) => handleError(error, reject, options));
      });
    });
  }
  function get(fetcher, url, options, parameters) {
    return __awaiter3(this, void 0, void 0, function* () {
      return _handleRequest(fetcher, "GET", url, options, parameters);
    });
  }
  function post(fetcher, url, body, options, parameters) {
    return __awaiter3(this, void 0, void 0, function* () {
      return _handleRequest(fetcher, "POST", url, options, parameters, body);
    });
  }
  function put(fetcher, url, body, options, parameters) {
    return __awaiter3(this, void 0, void 0, function* () {
      return _handleRequest(fetcher, "PUT", url, options, parameters, body);
    });
  }
  function head(fetcher, url, options, parameters) {
    return __awaiter3(this, void 0, void 0, function* () {
      return _handleRequest(fetcher, "HEAD", url, Object.assign(Object.assign({}, options), { noResolveJson: true }), parameters);
    });
  }
  function remove(fetcher, url, body, options, parameters) {
    return __awaiter3(this, void 0, void 0, function* () {
      return _handleRequest(fetcher, "DELETE", url, options, parameters, body);
    });
  }

  // node_modules/@supabase/storage-js/dist/module/packages/StorageFileApi.js
  var __awaiter4 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var DEFAULT_SEARCH_OPTIONS = {
    limit: 100,
    offset: 0,
    sortBy: {
      column: "name",
      order: "asc"
    }
  };
  var DEFAULT_FILE_OPTIONS = {
    cacheControl: "3600",
    contentType: "text/plain;charset=UTF-8",
    upsert: false
  };
  var StorageFileApi = class {
    constructor(url, headers = {}, bucketId, fetch3) {
      this.url = url;
      this.headers = headers;
      this.bucketId = bucketId;
      this.fetch = resolveFetch2(fetch3);
    }
    /**
     * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
     *
     * @param method HTTP method.
     * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
     * @param fileBody The body of the file to be stored in the bucket.
     */
    uploadOrUpdate(method, path, fileBody, fileOptions) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          let body;
          const options = Object.assign(Object.assign({}, DEFAULT_FILE_OPTIONS), fileOptions);
          let headers = Object.assign(Object.assign({}, this.headers), method === "POST" && { "x-upsert": String(options.upsert) });
          const metadata = options.metadata;
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            if (metadata) {
              body.append("metadata", this.encodeMetadata(metadata));
            }
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            body.append("cacheControl", options.cacheControl);
            if (metadata) {
              body.append("metadata", this.encodeMetadata(metadata));
            }
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
            if (metadata) {
              headers["x-metadata"] = this.toBase64(this.encodeMetadata(metadata));
            }
          }
          if (fileOptions === null || fileOptions === void 0 ? void 0 : fileOptions.headers) {
            headers = Object.assign(Object.assign({}, headers), fileOptions.headers);
          }
          const cleanPath = this._removeEmptyFolders(path);
          const _path = this._getFinalPath(cleanPath);
          const res = yield this.fetch(`${this.url}/object/${_path}`, Object.assign({ method, body, headers }, (options === null || options === void 0 ? void 0 : options.duplex) ? { duplex: options.duplex } : {}));
          const data = yield res.json();
          if (res.ok) {
            return {
              data: { path: cleanPath, id: data.Id, fullPath: data.Key },
              error: null
            };
          } else {
            const error = data;
            return { data: null, error };
          }
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Uploads a file to an existing bucket.
     *
     * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
     * @param fileBody The body of the file to be stored in the bucket.
     */
    upload(path, fileBody, fileOptions) {
      return __awaiter4(this, void 0, void 0, function* () {
        return this.uploadOrUpdate("POST", path, fileBody, fileOptions);
      });
    }
    /**
     * Upload a file with a token generated from `createSignedUploadUrl`.
     * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
     * @param token The token generated from `createSignedUploadUrl`
     * @param fileBody The body of the file to be stored in the bucket.
     */
    uploadToSignedUrl(path, token, fileBody, fileOptions) {
      return __awaiter4(this, void 0, void 0, function* () {
        const cleanPath = this._removeEmptyFolders(path);
        const _path = this._getFinalPath(cleanPath);
        const url = new URL(this.url + `/object/upload/sign/${_path}`);
        url.searchParams.set("token", token);
        try {
          let body;
          const options = Object.assign({ upsert: DEFAULT_FILE_OPTIONS.upsert }, fileOptions);
          const headers = Object.assign(Object.assign({}, this.headers), { "x-upsert": String(options.upsert) });
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            body.append("cacheControl", options.cacheControl);
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
          }
          const res = yield this.fetch(url.toString(), {
            method: "PUT",
            body,
            headers
          });
          const data = yield res.json();
          if (res.ok) {
            return {
              data: { path: cleanPath, fullPath: data.Key },
              error: null
            };
          } else {
            const error = data;
            return { data: null, error };
          }
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Creates a signed upload URL.
     * Signed upload URLs can be used to upload files to the bucket without further authentication.
     * They are valid for 2 hours.
     * @param path The file path, including the current file name. For example `folder/image.png`.
     * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
     */
    createSignedUploadUrl(path, options) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          let _path = this._getFinalPath(path);
          const headers = Object.assign({}, this.headers);
          if (options === null || options === void 0 ? void 0 : options.upsert) {
            headers["x-upsert"] = "true";
          }
          const data = yield post(this.fetch, `${this.url}/object/upload/sign/${_path}`, {}, { headers });
          const url = new URL(this.url + data.url);
          const token = url.searchParams.get("token");
          if (!token) {
            throw new StorageError("No token returned by API");
          }
          return { data: { signedUrl: url.toString(), path, token }, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Replaces an existing file at the specified path with a new one.
     *
     * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
     * @param fileBody The body of the file to be stored in the bucket.
     */
    update(path, fileBody, fileOptions) {
      return __awaiter4(this, void 0, void 0, function* () {
        return this.uploadOrUpdate("PUT", path, fileBody, fileOptions);
      });
    }
    /**
     * Moves an existing file to a new path in the same bucket.
     *
     * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
     * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
     * @param options The destination options.
     */
    move(fromPath, toPath, options) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          const data = yield post(this.fetch, `${this.url}/object/move`, {
            bucketId: this.bucketId,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
          }, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Copies an existing file to a new path in the same bucket.
     *
     * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
     * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
     * @param options The destination options.
     */
    copy(fromPath, toPath, options) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          const data = yield post(this.fetch, `${this.url}/object/copy`, {
            bucketId: this.bucketId,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
          }, { headers: this.headers });
          return { data: { path: data.Key }, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
     *
     * @param path The file path, including the current file name. For example `folder/image.png`.
     * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
     * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
     * @param options.transform Transform the asset before serving it to the client.
     */
    createSignedUrl(path, expiresIn, options) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          let _path = this._getFinalPath(path);
          let data = yield post(this.fetch, `${this.url}/object/sign/${_path}`, Object.assign({ expiresIn }, (options === null || options === void 0 ? void 0 : options.transform) ? { transform: options.transform } : {}), { headers: this.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          const signedUrl = encodeURI(`${this.url}${data.signedURL}${downloadQueryParam}`);
          data = { signedUrl };
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
     *
     * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
     * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
     * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
     */
    createSignedUrls(paths, expiresIn, options) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          const data = yield post(this.fetch, `${this.url}/object/sign/${this.bucketId}`, { expiresIn, paths }, { headers: this.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          return {
            data: data.map((datum) => Object.assign(Object.assign({}, datum), { signedUrl: datum.signedURL ? encodeURI(`${this.url}${datum.signedURL}${downloadQueryParam}`) : null })),
            error: null
          };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
     *
     * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
     * @param options.transform Transform the asset before serving it to the client.
     */
    download(path, options) {
      return __awaiter4(this, void 0, void 0, function* () {
        const wantsTransformation = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined";
        const renderPath = wantsTransformation ? "render/image/authenticated" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        const queryString = transformationQuery ? `?${transformationQuery}` : "";
        try {
          const _path = this._getFinalPath(path);
          const res = yield get(this.fetch, `${this.url}/${renderPath}/${_path}${queryString}`, {
            headers: this.headers,
            noResolveJson: true
          });
          const data = yield res.blob();
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Retrieves the details of an existing file.
     * @param path
     */
    info(path) {
      return __awaiter4(this, void 0, void 0, function* () {
        const _path = this._getFinalPath(path);
        try {
          const data = yield get(this.fetch, `${this.url}/object/info/${_path}`, {
            headers: this.headers
          });
          return { data: recursiveToCamel(data), error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Checks the existence of a file.
     * @param path
     */
    exists(path) {
      return __awaiter4(this, void 0, void 0, function* () {
        const _path = this._getFinalPath(path);
        try {
          yield head(this.fetch, `${this.url}/object/${_path}`, {
            headers: this.headers
          });
          return { data: true, error: null };
        } catch (error) {
          if (isStorageError(error) && error instanceof StorageUnknownError) {
            const originalError = error.originalError;
            if ([400, 404].includes(originalError === null || originalError === void 0 ? void 0 : originalError.status)) {
              return { data: false, error };
            }
          }
          throw error;
        }
      });
    }
    /**
     * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
     * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
     *
     * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
     * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
     * @param options.transform Transform the asset before serving it to the client.
     */
    getPublicUrl(path, options) {
      const _path = this._getFinalPath(path);
      const _queryString = [];
      const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `download=${options.download === true ? "" : options.download}` : "";
      if (downloadQueryParam !== "") {
        _queryString.push(downloadQueryParam);
      }
      const wantsTransformation = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined";
      const renderPath = wantsTransformation ? "render/image" : "object";
      const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
      if (transformationQuery !== "") {
        _queryString.push(transformationQuery);
      }
      let queryString = _queryString.join("&");
      if (queryString !== "") {
        queryString = `?${queryString}`;
      }
      return {
        data: { publicUrl: encodeURI(`${this.url}/${renderPath}/public/${_path}${queryString}`) }
      };
    }
    /**
     * Deletes files within the same bucket
     *
     * @param paths An array of files to delete, including the path and file name. For example [`'folder/image.png'`].
     */
    remove(paths) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          const data = yield remove(this.fetch, `${this.url}/object/${this.bucketId}`, { prefixes: paths }, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Get file metadata
     * @param id the file id to retrieve metadata
     */
    // async getMetadata(
    //   id: string
    // ): Promise<
    //   | {
    //       data: Metadata
    //       error: null
    //     }
    //   | {
    //       data: null
    //       error: StorageError
    //     }
    // > {
    //   try {
    //     const data = await get(this.fetch, `${this.url}/metadata/${id}`, { headers: this.headers })
    //     return { data, error: null }
    //   } catch (error) {
    //     if (isStorageError(error)) {
    //       return { data: null, error }
    //     }
    //     throw error
    //   }
    // }
    /**
     * Update file metadata
     * @param id the file id to update metadata
     * @param meta the new file metadata
     */
    // async updateMetadata(
    //   id: string,
    //   meta: Metadata
    // ): Promise<
    //   | {
    //       data: Metadata
    //       error: null
    //     }
    //   | {
    //       data: null
    //       error: StorageError
    //     }
    // > {
    //   try {
    //     const data = await post(
    //       this.fetch,
    //       `${this.url}/metadata/${id}`,
    //       { ...meta },
    //       { headers: this.headers }
    //     )
    //     return { data, error: null }
    //   } catch (error) {
    //     if (isStorageError(error)) {
    //       return { data: null, error }
    //     }
    //     throw error
    //   }
    // }
    /**
     * Lists all the files within a bucket.
     * @param path The folder path.
     */
    list(path, options, parameters) {
      return __awaiter4(this, void 0, void 0, function* () {
        try {
          const body = Object.assign(Object.assign(Object.assign({}, DEFAULT_SEARCH_OPTIONS), options), { prefix: path || "" });
          const data = yield post(this.fetch, `${this.url}/object/list/${this.bucketId}`, body, { headers: this.headers }, parameters);
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    encodeMetadata(metadata) {
      return JSON.stringify(metadata);
    }
    toBase64(data) {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(data).toString("base64");
      }
      return btoa(data);
    }
    _getFinalPath(path) {
      return `${this.bucketId}/${path}`;
    }
    _removeEmptyFolders(path) {
      return path.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
    }
    transformOptsToQueryString(transform) {
      const params = [];
      if (transform.width) {
        params.push(`width=${transform.width}`);
      }
      if (transform.height) {
        params.push(`height=${transform.height}`);
      }
      if (transform.resize) {
        params.push(`resize=${transform.resize}`);
      }
      if (transform.format) {
        params.push(`format=${transform.format}`);
      }
      if (transform.quality) {
        params.push(`quality=${transform.quality}`);
      }
      return params.join("&");
    }
  };

  // node_modules/@supabase/storage-js/dist/module/lib/version.js
  var version2 = "2.7.1";

  // node_modules/@supabase/storage-js/dist/module/lib/constants.js
  var DEFAULT_HEADERS2 = { "X-Client-Info": `storage-js/${version2}` };

  // node_modules/@supabase/storage-js/dist/module/packages/StorageBucketApi.js
  var __awaiter5 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var StorageBucketApi = class {
    constructor(url, headers = {}, fetch3) {
      this.url = url;
      this.headers = Object.assign(Object.assign({}, DEFAULT_HEADERS2), headers);
      this.fetch = resolveFetch2(fetch3);
    }
    /**
     * Retrieves the details of all Storage buckets within an existing project.
     */
    listBuckets() {
      return __awaiter5(this, void 0, void 0, function* () {
        try {
          const data = yield get(this.fetch, `${this.url}/bucket`, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Retrieves the details of an existing Storage bucket.
     *
     * @param id The unique identifier of the bucket you would like to retrieve.
     */
    getBucket(id) {
      return __awaiter5(this, void 0, void 0, function* () {
        try {
          const data = yield get(this.fetch, `${this.url}/bucket/${id}`, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Creates a new Storage bucket
     *
     * @param id A unique identifier for the bucket you are creating.
     * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
     * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
     * The global file size limit takes precedence over this value.
     * The default value is null, which doesn't set a per bucket file size limit.
     * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
     * The default value is null, which allows files with all mime types to be uploaded.
     * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
     * @returns newly created bucket id
     */
    createBucket(id, options = {
      public: false
    }) {
      return __awaiter5(this, void 0, void 0, function* () {
        try {
          const data = yield post(this.fetch, `${this.url}/bucket`, {
            id,
            name: id,
            public: options.public,
            file_size_limit: options.fileSizeLimit,
            allowed_mime_types: options.allowedMimeTypes
          }, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Updates a Storage bucket
     *
     * @param id A unique identifier for the bucket you are updating.
     * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
     * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
     * The global file size limit takes precedence over this value.
     * The default value is null, which doesn't set a per bucket file size limit.
     * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
     * The default value is null, which allows files with all mime types to be uploaded.
     * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
     */
    updateBucket(id, options) {
      return __awaiter5(this, void 0, void 0, function* () {
        try {
          const data = yield put(this.fetch, `${this.url}/bucket/${id}`, {
            id,
            name: id,
            public: options.public,
            file_size_limit: options.fileSizeLimit,
            allowed_mime_types: options.allowedMimeTypes
          }, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Removes all objects inside a single bucket.
     *
     * @param id The unique identifier of the bucket you would like to empty.
     */
    emptyBucket(id) {
      return __awaiter5(this, void 0, void 0, function* () {
        try {
          const data = yield post(this.fetch, `${this.url}/bucket/${id}/empty`, {}, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
     * You must first `empty()` the bucket.
     *
     * @param id The unique identifier of the bucket you would like to delete.
     */
    deleteBucket(id) {
      return __awaiter5(this, void 0, void 0, function* () {
        try {
          const data = yield remove(this.fetch, `${this.url}/bucket/${id}`, {}, { headers: this.headers });
          return { data, error: null };
        } catch (error) {
          if (isStorageError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
  };

  // node_modules/@supabase/storage-js/dist/module/StorageClient.js
  var StorageClient = class extends StorageBucketApi {
    constructor(url, headers = {}, fetch3) {
      super(url, headers, fetch3);
    }
    /**
     * Perform file operation in a bucket.
     *
     * @param id The bucket id to operate on.
     */
    from(id) {
      return new StorageFileApi(this.url, this.headers, id, this.fetch);
    }
  };

  // node_modules/@supabase/supabase-js/dist/module/lib/version.js
  var version3 = "2.48.1";

  // node_modules/@supabase/supabase-js/dist/module/lib/constants.js
  var JS_ENV = "";
  if (typeof Deno !== "undefined") {
    JS_ENV = "deno";
  } else if (typeof document !== "undefined") {
    JS_ENV = "web";
  } else if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
    JS_ENV = "react-native";
  } else {
    JS_ENV = "node";
  }
  var DEFAULT_HEADERS3 = { "X-Client-Info": `supabase-js-${JS_ENV}/${version3}` };
  var DEFAULT_GLOBAL_OPTIONS = {
    headers: DEFAULT_HEADERS3
  };
  var DEFAULT_DB_OPTIONS = {
    schema: "public"
  };
  var DEFAULT_AUTH_OPTIONS = {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "implicit"
  };
  var DEFAULT_REALTIME_OPTIONS = {};

  // node_modules/@supabase/supabase-js/dist/module/lib/fetch.js
  init_browser();
  var __awaiter6 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var resolveFetch3 = (customFetch) => {
    let _fetch;
    if (customFetch) {
      _fetch = customFetch;
    } else if (typeof fetch === "undefined") {
      _fetch = browser_default;
    } else {
      _fetch = fetch;
    }
    return (...args) => _fetch(...args);
  };
  var resolveHeadersConstructor = () => {
    if (typeof Headers === "undefined") {
      return Headers2;
    }
    return Headers;
  };
  var fetchWithAuth = (supabaseKey, getAccessToken, customFetch) => {
    const fetch3 = resolveFetch3(customFetch);
    const HeadersConstructor = resolveHeadersConstructor();
    return (input, init) => __awaiter6(void 0, void 0, void 0, function* () {
      var _a;
      const accessToken = (_a = yield getAccessToken()) !== null && _a !== void 0 ? _a : supabaseKey;
      let headers = new HeadersConstructor(init === null || init === void 0 ? void 0 : init.headers);
      if (!headers.has("apikey")) {
        headers.set("apikey", supabaseKey);
      }
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      return fetch3(input, Object.assign(Object.assign({}, init), { headers }));
    });
  };

  // node_modules/@supabase/supabase-js/dist/module/lib/helpers.js
  var __awaiter7 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  function stripTrailingSlash(url) {
    return url.replace(/\/$/, "");
  }
  function applySettingDefaults(options, defaults) {
    const { db: dbOptions, auth: authOptions, realtime: realtimeOptions, global: globalOptions } = options;
    const { db: DEFAULT_DB_OPTIONS2, auth: DEFAULT_AUTH_OPTIONS2, realtime: DEFAULT_REALTIME_OPTIONS2, global: DEFAULT_GLOBAL_OPTIONS2 } = defaults;
    const result = {
      db: Object.assign(Object.assign({}, DEFAULT_DB_OPTIONS2), dbOptions),
      auth: Object.assign(Object.assign({}, DEFAULT_AUTH_OPTIONS2), authOptions),
      realtime: Object.assign(Object.assign({}, DEFAULT_REALTIME_OPTIONS2), realtimeOptions),
      global: Object.assign(Object.assign({}, DEFAULT_GLOBAL_OPTIONS2), globalOptions),
      accessToken: () => __awaiter7(this, void 0, void 0, function* () {
        return "";
      })
    };
    if (options.accessToken) {
      result.accessToken = options.accessToken;
    } else {
      delete result.accessToken;
    }
    return result;
  }

  // node_modules/@supabase/auth-js/dist/module/lib/version.js
  var version4 = "2.67.3";

  // node_modules/@supabase/auth-js/dist/module/lib/constants.js
  var GOTRUE_URL = "http://localhost:9999";
  var STORAGE_KEY = "supabase.auth.token";
  var DEFAULT_HEADERS4 = { "X-Client-Info": `gotrue-js/${version4}` };
  var EXPIRY_MARGIN = 10;
  var API_VERSION_HEADER_NAME = "X-Supabase-Api-Version";
  var API_VERSIONS = {
    "2024-01-01": {
      timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
      name: "2024-01-01"
    }
  };

  // node_modules/@supabase/auth-js/dist/module/lib/helpers.js
  function expiresAt(expiresIn) {
    const timeNow = Math.round(Date.now() / 1e3);
    return timeNow + expiresIn;
  }
  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  var isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
  var localStorageWriteTests = {
    tested: false,
    writable: false
  };
  var supportsLocalStorage = () => {
    if (!isBrowser()) {
      return false;
    }
    try {
      if (typeof globalThis.localStorage !== "object") {
        return false;
      }
    } catch (e) {
      return false;
    }
    if (localStorageWriteTests.tested) {
      return localStorageWriteTests.writable;
    }
    const randomKey = `lswt-${Math.random()}${Math.random()}`;
    try {
      globalThis.localStorage.setItem(randomKey, randomKey);
      globalThis.localStorage.removeItem(randomKey);
      localStorageWriteTests.tested = true;
      localStorageWriteTests.writable = true;
    } catch (e) {
      localStorageWriteTests.tested = true;
      localStorageWriteTests.writable = false;
    }
    return localStorageWriteTests.writable;
  };
  function parseParametersFromURL(href) {
    const result = {};
    const url = new URL(href);
    if (url.hash && url.hash[0] === "#") {
      try {
        const hashSearchParams = new URLSearchParams(url.hash.substring(1));
        hashSearchParams.forEach((value, key) => {
          result[key] = value;
        });
      } catch (e) {
      }
    }
    url.searchParams.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  var resolveFetch4 = (customFetch) => {
    let _fetch;
    if (customFetch) {
      _fetch = customFetch;
    } else if (typeof fetch === "undefined") {
      _fetch = (...args) => Promise.resolve().then(() => (init_browser(), browser_exports)).then(({ default: fetch3 }) => fetch3(...args));
    } else {
      _fetch = fetch;
    }
    return (...args) => _fetch(...args);
  };
  var looksLikeFetchResponse = (maybeResponse) => {
    return typeof maybeResponse === "object" && maybeResponse !== null && "status" in maybeResponse && "ok" in maybeResponse && "json" in maybeResponse && typeof maybeResponse.json === "function";
  };
  var setItemAsync = async (storage, key, data) => {
    await storage.setItem(key, JSON.stringify(data));
  };
  var getItemAsync = async (storage, key) => {
    const value = await storage.getItem(key);
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch (_a) {
      return value;
    }
  };
  var removeItemAsync = async (storage, key) => {
    await storage.removeItem(key);
  };
  function decodeBase64URL(value) {
    const key = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let base64 = "";
    let chr1, chr2, chr3;
    let enc1, enc2, enc3, enc4;
    let i = 0;
    value = value.replace("-", "+").replace("_", "/");
    while (i < value.length) {
      enc1 = key.indexOf(value.charAt(i++));
      enc2 = key.indexOf(value.charAt(i++));
      enc3 = key.indexOf(value.charAt(i++));
      enc4 = key.indexOf(value.charAt(i++));
      chr1 = enc1 << 2 | enc2 >> 4;
      chr2 = (enc2 & 15) << 4 | enc3 >> 2;
      chr3 = (enc3 & 3) << 6 | enc4;
      base64 = base64 + String.fromCharCode(chr1);
      if (enc3 != 64 && chr2 != 0) {
        base64 = base64 + String.fromCharCode(chr2);
      }
      if (enc4 != 64 && chr3 != 0) {
        base64 = base64 + String.fromCharCode(chr3);
      }
    }
    return base64;
  }
  var Deferred = class _Deferred {
    constructor() {
      ;
      this.promise = new _Deferred.promiseConstructor((res, rej) => {
        ;
        this.resolve = res;
        this.reject = rej;
      });
    }
  };
  Deferred.promiseConstructor = Promise;
  function decodeJWTPayload(token) {
    const base64UrlRegex = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}=?$|[a-z0-9_-]{2}(==)?$)$/i;
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("JWT is not valid: not a JWT structure");
    }
    if (!base64UrlRegex.test(parts[1])) {
      throw new Error("JWT is not valid: payload is not in base64url format");
    }
    const base64Url = parts[1];
    return JSON.parse(decodeBase64URL(base64Url));
  }
  async function sleep(time) {
    return await new Promise((accept) => {
      setTimeout(() => accept(null), time);
    });
  }
  function retryable(fn, isRetryable) {
    const promise = new Promise((accept, reject) => {
      ;
      (async () => {
        for (let attempt = 0; attempt < Infinity; attempt++) {
          try {
            const result = await fn(attempt);
            if (!isRetryable(attempt, null, result)) {
              accept(result);
              return;
            }
          } catch (e) {
            if (!isRetryable(attempt, e)) {
              reject(e);
              return;
            }
          }
        }
      })();
    });
    return promise;
  }
  function dec2hex(dec) {
    return ("0" + dec.toString(16)).substr(-2);
  }
  function generatePKCEVerifier() {
    const verifierLength = 56;
    const array = new Uint32Array(verifierLength);
    if (typeof crypto === "undefined") {
      const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
      const charSetLen = charSet.length;
      let verifier = "";
      for (let i = 0; i < verifierLength; i++) {
        verifier += charSet.charAt(Math.floor(Math.random() * charSetLen));
      }
      return verifier;
    }
    crypto.getRandomValues(array);
    return Array.from(array, dec2hex).join("");
  }
  async function sha256(randomString) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(randomString);
    const hash = await crypto.subtle.digest("SHA-256", encodedData);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).map((c) => String.fromCharCode(c)).join("");
  }
  function base64urlencode(str) {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function generatePKCEChallenge(verifier) {
    const hasCryptoSupport = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined";
    if (!hasCryptoSupport) {
      console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.");
      return verifier;
    }
    const hashed = await sha256(verifier);
    return base64urlencode(hashed);
  }
  async function getCodeChallengeAndMethod(storage, storageKey, isPasswordRecovery = false) {
    const codeVerifier = generatePKCEVerifier();
    let storedCodeVerifier = codeVerifier;
    if (isPasswordRecovery) {
      storedCodeVerifier += "/PASSWORD_RECOVERY";
    }
    await setItemAsync(storage, `${storageKey}-code-verifier`, storedCodeVerifier);
    const codeChallenge = await generatePKCEChallenge(codeVerifier);
    const codeChallengeMethod = codeVerifier === codeChallenge ? "plain" : "s256";
    return [codeChallenge, codeChallengeMethod];
  }
  var API_VERSION_REGEX = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
  function parseResponseAPIVersion(response) {
    const apiVersion = response.headers.get(API_VERSION_HEADER_NAME);
    if (!apiVersion) {
      return null;
    }
    if (!apiVersion.match(API_VERSION_REGEX)) {
      return null;
    }
    try {
      const date = /* @__PURE__ */ new Date(`${apiVersion}T00:00:00.0Z`);
      return date;
    } catch (e) {
      return null;
    }
  }

  // node_modules/@supabase/auth-js/dist/module/lib/errors.js
  var AuthError = class extends Error {
    constructor(message, status, code) {
      super(message);
      this.__isAuthError = true;
      this.name = "AuthError";
      this.status = status;
      this.code = code;
    }
  };
  function isAuthError(error) {
    return typeof error === "object" && error !== null && "__isAuthError" in error;
  }
  var AuthApiError = class extends AuthError {
    constructor(message, status, code) {
      super(message, status, code);
      this.name = "AuthApiError";
      this.status = status;
      this.code = code;
    }
  };
  function isAuthApiError(error) {
    return isAuthError(error) && error.name === "AuthApiError";
  }
  var AuthUnknownError = class extends AuthError {
    constructor(message, originalError) {
      super(message);
      this.name = "AuthUnknownError";
      this.originalError = originalError;
    }
  };
  var CustomAuthError = class extends AuthError {
    constructor(message, name, status, code) {
      super(message, status, code);
      this.name = name;
      this.status = status;
    }
  };
  var AuthSessionMissingError = class extends CustomAuthError {
    constructor() {
      super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
    }
  };
  function isAuthSessionMissingError(error) {
    return isAuthError(error) && error.name === "AuthSessionMissingError";
  }
  var AuthInvalidTokenResponseError = class extends CustomAuthError {
    constructor() {
      super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
    }
  };
  var AuthInvalidCredentialsError = class extends CustomAuthError {
    constructor(message) {
      super(message, "AuthInvalidCredentialsError", 400, void 0);
    }
  };
  var AuthImplicitGrantRedirectError = class extends CustomAuthError {
    constructor(message, details = null) {
      super(message, "AuthImplicitGrantRedirectError", 500, void 0);
      this.details = null;
      this.details = details;
    }
    toJSON() {
      return {
        name: this.name,
        message: this.message,
        status: this.status,
        details: this.details
      };
    }
  };
  function isAuthImplicitGrantRedirectError(error) {
    return isAuthError(error) && error.name === "AuthImplicitGrantRedirectError";
  }
  var AuthPKCEGrantCodeExchangeError = class extends CustomAuthError {
    constructor(message, details = null) {
      super(message, "AuthPKCEGrantCodeExchangeError", 500, void 0);
      this.details = null;
      this.details = details;
    }
    toJSON() {
      return {
        name: this.name,
        message: this.message,
        status: this.status,
        details: this.details
      };
    }
  };
  var AuthRetryableFetchError = class extends CustomAuthError {
    constructor(message, status) {
      super(message, "AuthRetryableFetchError", status, void 0);
    }
  };
  function isAuthRetryableFetchError(error) {
    return isAuthError(error) && error.name === "AuthRetryableFetchError";
  }
  var AuthWeakPasswordError = class extends CustomAuthError {
    constructor(message, status, reasons) {
      super(message, "AuthWeakPasswordError", status, "weak_password");
      this.reasons = reasons;
    }
  };

  // node_modules/@supabase/auth-js/dist/module/lib/fetch.js
  var __rest = function(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  };
  var _getErrorMessage2 = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
  var NETWORK_ERROR_CODES = [502, 503, 504];
  async function handleError2(error) {
    var _a;
    if (!looksLikeFetchResponse(error)) {
      throw new AuthRetryableFetchError(_getErrorMessage2(error), 0);
    }
    if (NETWORK_ERROR_CODES.includes(error.status)) {
      throw new AuthRetryableFetchError(_getErrorMessage2(error), error.status);
    }
    let data;
    try {
      data = await error.json();
    } catch (e) {
      throw new AuthUnknownError(_getErrorMessage2(e), e);
    }
    let errorCode = void 0;
    const responseAPIVersion = parseResponseAPIVersion(error);
    if (responseAPIVersion && responseAPIVersion.getTime() >= API_VERSIONS["2024-01-01"].timestamp && typeof data === "object" && data && typeof data.code === "string") {
      errorCode = data.code;
    } else if (typeof data === "object" && data && typeof data.error_code === "string") {
      errorCode = data.error_code;
    }
    if (!errorCode) {
      if (typeof data === "object" && data && typeof data.weak_password === "object" && data.weak_password && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
        throw new AuthWeakPasswordError(_getErrorMessage2(data), error.status, data.weak_password.reasons);
      }
    } else if (errorCode === "weak_password") {
      throw new AuthWeakPasswordError(_getErrorMessage2(data), error.status, ((_a = data.weak_password) === null || _a === void 0 ? void 0 : _a.reasons) || []);
    } else if (errorCode === "session_not_found") {
      throw new AuthSessionMissingError();
    }
    throw new AuthApiError(_getErrorMessage2(data), error.status || 500, errorCode);
  }
  var _getRequestParams2 = (method, options, parameters, body) => {
    const params = { method, headers: (options === null || options === void 0 ? void 0 : options.headers) || {} };
    if (method === "GET") {
      return params;
    }
    params.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, options === null || options === void 0 ? void 0 : options.headers);
    params.body = JSON.stringify(body);
    return Object.assign(Object.assign({}, params), parameters);
  };
  async function _request(fetcher, method, url, options) {
    var _a;
    const headers = Object.assign({}, options === null || options === void 0 ? void 0 : options.headers);
    if (!headers[API_VERSION_HEADER_NAME]) {
      headers[API_VERSION_HEADER_NAME] = API_VERSIONS["2024-01-01"].name;
    }
    if (options === null || options === void 0 ? void 0 : options.jwt) {
      headers["Authorization"] = `Bearer ${options.jwt}`;
    }
    const qs = (_a = options === null || options === void 0 ? void 0 : options.query) !== null && _a !== void 0 ? _a : {};
    if (options === null || options === void 0 ? void 0 : options.redirectTo) {
      qs["redirect_to"] = options.redirectTo;
    }
    const queryString = Object.keys(qs).length ? "?" + new URLSearchParams(qs).toString() : "";
    const data = await _handleRequest2(fetcher, method, url + queryString, {
      headers,
      noResolveJson: options === null || options === void 0 ? void 0 : options.noResolveJson
    }, {}, options === null || options === void 0 ? void 0 : options.body);
    return (options === null || options === void 0 ? void 0 : options.xform) ? options === null || options === void 0 ? void 0 : options.xform(data) : { data: Object.assign({}, data), error: null };
  }
  async function _handleRequest2(fetcher, method, url, options, parameters, body) {
    const requestParams = _getRequestParams2(method, options, parameters, body);
    let result;
    try {
      result = await fetcher(url, Object.assign({}, requestParams));
    } catch (e) {
      console.error(e);
      throw new AuthRetryableFetchError(_getErrorMessage2(e), 0);
    }
    if (!result.ok) {
      await handleError2(result);
    }
    if (options === null || options === void 0 ? void 0 : options.noResolveJson) {
      return result;
    }
    try {
      return await result.json();
    } catch (e) {
      await handleError2(e);
    }
  }
  function _sessionResponse(data) {
    var _a;
    let session = null;
    if (hasSession(data)) {
      session = Object.assign({}, data);
      if (!data.expires_at) {
        session.expires_at = expiresAt(data.expires_in);
      }
    }
    const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
    return { data: { session, user }, error: null };
  }
  function _sessionResponsePassword(data) {
    const response = _sessionResponse(data);
    if (!response.error && data.weak_password && typeof data.weak_password === "object" && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.message && typeof data.weak_password.message === "string" && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
      response.data.weak_password = data.weak_password;
    }
    return response;
  }
  function _userResponse(data) {
    var _a;
    const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
    return { data: { user }, error: null };
  }
  function _ssoResponse(data) {
    return { data, error: null };
  }
  function _generateLinkResponse(data) {
    const { action_link, email_otp, hashed_token, redirect_to, verification_type } = data, rest = __rest(data, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]);
    const properties = {
      action_link,
      email_otp,
      hashed_token,
      redirect_to,
      verification_type
    };
    const user = Object.assign({}, rest);
    return {
      data: {
        properties,
        user
      },
      error: null
    };
  }
  function _noResolveJsonResponse(data) {
    return data;
  }
  function hasSession(data) {
    return data.access_token && data.refresh_token && data.expires_in;
  }

  // node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.js
  var __rest2 = function(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  };
  var GoTrueAdminApi = class {
    constructor({ url = "", headers = {}, fetch: fetch3 }) {
      this.url = url;
      this.headers = headers;
      this.fetch = resolveFetch4(fetch3);
      this.mfa = {
        listFactors: this._listFactors.bind(this),
        deleteFactor: this._deleteFactor.bind(this)
      };
    }
    /**
     * Removes a logged-in session.
     * @param jwt A valid, logged-in JWT.
     * @param scope The logout sope.
     */
    async signOut(jwt, scope = "global") {
      try {
        await _request(this.fetch, "POST", `${this.url}/logout?scope=${scope}`, {
          headers: this.headers,
          jwt,
          noResolveJson: true
        });
        return { data: null, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    /**
     * Sends an invite link to an email address.
     * @param email The email address of the user.
     * @param options Additional options to be included when inviting.
     */
    async inviteUserByEmail(email, options = {}) {
      try {
        return await _request(this.fetch, "POST", `${this.url}/invite`, {
          body: { email, data: options.data },
          headers: this.headers,
          redirectTo: options.redirectTo,
          xform: _userResponse
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Generates email links and OTPs to be sent via a custom email provider.
     * @param email The user's email.
     * @param options.password User password. For signup only.
     * @param options.data Optional user metadata. For signup only.
     * @param options.redirectTo The redirect url which should be appended to the generated link
     */
    async generateLink(params) {
      try {
        const { options } = params, rest = __rest2(params, ["options"]);
        const body = Object.assign(Object.assign({}, rest), options);
        if ("newEmail" in rest) {
          body.new_email = rest === null || rest === void 0 ? void 0 : rest.newEmail;
          delete body["newEmail"];
        }
        return await _request(this.fetch, "POST", `${this.url}/admin/generate_link`, {
          body,
          headers: this.headers,
          xform: _generateLinkResponse,
          redirectTo: options === null || options === void 0 ? void 0 : options.redirectTo
        });
      } catch (error) {
        if (isAuthError(error)) {
          return {
            data: {
              properties: null,
              user: null
            },
            error
          };
        }
        throw error;
      }
    }
    // User Admin API
    /**
     * Creates a new user.
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */
    async createUser(attributes) {
      try {
        return await _request(this.fetch, "POST", `${this.url}/admin/users`, {
          body: attributes,
          headers: this.headers,
          xform: _userResponse
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Get a list of users.
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
     */
    async listUsers(params) {
      var _a, _b, _c, _d, _e, _f, _g;
      try {
        const pagination = { nextPage: null, lastPage: 0, total: 0 };
        const response = await _request(this.fetch, "GET", `${this.url}/admin/users`, {
          headers: this.headers,
          noResolveJson: true,
          query: {
            page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
            per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
          },
          xform: _noResolveJsonResponse
        });
        if (response.error)
          throw response.error;
        const users = await response.json();
        const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
        const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
        if (links.length > 0) {
          links.forEach((link) => {
            const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
            const rel = JSON.parse(link.split(";")[1].split("=")[1]);
            pagination[`${rel}Page`] = page;
          });
          pagination.total = parseInt(total);
        }
        return { data: Object.assign(Object.assign({}, users), pagination), error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { users: [] }, error };
        }
        throw error;
      }
    }
    /**
     * Get user by id.
     *
     * @param uid The user's unique identifier
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */
    async getUserById(uid) {
      try {
        return await _request(this.fetch, "GET", `${this.url}/admin/users/${uid}`, {
          headers: this.headers,
          xform: _userResponse
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Updates the user data.
     *
     * @param attributes The data you want to update.
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */
    async updateUserById(uid, attributes) {
      try {
        return await _request(this.fetch, "PUT", `${this.url}/admin/users/${uid}`, {
          body: attributes,
          headers: this.headers,
          xform: _userResponse
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Delete a user. Requires a `service_role` key.
     *
     * @param id The user id you want to remove.
     * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
     * Defaults to false for backward compatibility.
     *
     * This function should only be called on a server. Never expose your `service_role` key in the browser.
     */
    async deleteUser(id, shouldSoftDelete = false) {
      try {
        return await _request(this.fetch, "DELETE", `${this.url}/admin/users/${id}`, {
          headers: this.headers,
          body: {
            should_soft_delete: shouldSoftDelete
          },
          xform: _userResponse
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    async _listFactors(params) {
      try {
        const { data, error } = await _request(this.fetch, "GET", `${this.url}/admin/users/${params.userId}/factors`, {
          headers: this.headers,
          xform: (factors) => {
            return { data: { factors }, error: null };
          }
        });
        return { data, error };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    async _deleteFactor(params) {
      try {
        const data = await _request(this.fetch, "DELETE", `${this.url}/admin/users/${params.userId}/factors/${params.id}`, {
          headers: this.headers
        });
        return { data, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
  };

  // node_modules/@supabase/auth-js/dist/module/lib/local-storage.js
  var localStorageAdapter = {
    getItem: (key) => {
      if (!supportsLocalStorage()) {
        return null;
      }
      return globalThis.localStorage.getItem(key);
    },
    setItem: (key, value) => {
      if (!supportsLocalStorage()) {
        return;
      }
      globalThis.localStorage.setItem(key, value);
    },
    removeItem: (key) => {
      if (!supportsLocalStorage()) {
        return;
      }
      globalThis.localStorage.removeItem(key);
    }
  };
  function memoryLocalStorageAdapter(store = {}) {
    return {
      getItem: (key) => {
        return store[key] || null;
      },
      setItem: (key, value) => {
        store[key] = value;
      },
      removeItem: (key) => {
        delete store[key];
      }
    };
  }

  // node_modules/@supabase/auth-js/dist/module/lib/polyfills.js
  function polyfillGlobalThis() {
    if (typeof globalThis === "object")
      return;
    try {
      Object.defineProperty(Object.prototype, "__magic__", {
        get: function() {
          return this;
        },
        configurable: true
      });
      __magic__.globalThis = __magic__;
      delete Object.prototype.__magic__;
    } catch (e) {
      if (typeof self !== "undefined") {
        self.globalThis = self;
      }
    }
  }

  // node_modules/@supabase/auth-js/dist/module/lib/locks.js
  var internals = {
    /**
     * @experimental
     */
    debug: !!(globalThis && supportsLocalStorage() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true")
  };
  var LockAcquireTimeoutError = class extends Error {
    constructor(message) {
      super(message);
      this.isAcquireTimeout = true;
    }
  };
  var NavigatorLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
  };
  async function navigatorLock(name, acquireTimeout, fn) {
    if (internals.debug) {
      console.log("@supabase/gotrue-js: navigatorLock: acquire lock", name, acquireTimeout);
    }
    const abortController = new globalThis.AbortController();
    if (acquireTimeout > 0) {
      setTimeout(() => {
        abortController.abort();
        if (internals.debug) {
          console.log("@supabase/gotrue-js: navigatorLock acquire timed out", name);
        }
      }, acquireTimeout);
    }
    return await Promise.resolve().then(() => globalThis.navigator.locks.request(name, acquireTimeout === 0 ? {
      mode: "exclusive",
      ifAvailable: true
    } : {
      mode: "exclusive",
      signal: abortController.signal
    }, async (lock) => {
      if (lock) {
        if (internals.debug) {
          console.log("@supabase/gotrue-js: navigatorLock: acquired", name, lock.name);
        }
        try {
          return await fn();
        } finally {
          if (internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: released", name, lock.name);
          }
        }
      } else {
        if (acquireTimeout === 0) {
          if (internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: not immediately available", name);
          }
          throw new NavigatorLockAcquireTimeoutError(`Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`);
        } else {
          if (internals.debug) {
            try {
              const result = await globalThis.navigator.locks.query();
              console.log("@supabase/gotrue-js: Navigator LockManager state", JSON.stringify(result, null, "  "));
            } catch (e) {
              console.warn("@supabase/gotrue-js: Error when querying Navigator LockManager state", e);
            }
          }
          console.warn("@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request");
          return await fn();
        }
      }
    }));
  }

  // node_modules/@supabase/auth-js/dist/module/GoTrueClient.js
  polyfillGlobalThis();
  var DEFAULT_OPTIONS = {
    url: GOTRUE_URL,
    storageKey: STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    headers: DEFAULT_HEADERS4,
    flowType: "implicit",
    debug: false,
    hasCustomAuthorizationHeader: false
  };
  var AUTO_REFRESH_TICK_DURATION = 30 * 1e3;
  var AUTO_REFRESH_TICK_THRESHOLD = 3;
  async function lockNoOp(name, acquireTimeout, fn) {
    return await fn();
  }
  var GoTrueClient = class _GoTrueClient {
    /**
     * Create a new client for use in the browser.
     */
    constructor(options) {
      var _a, _b;
      this.memoryStorage = null;
      this.stateChangeEmitters = /* @__PURE__ */ new Map();
      this.autoRefreshTicker = null;
      this.visibilityChangedCallback = null;
      this.refreshingDeferred = null;
      this.initializePromise = null;
      this.detectSessionInUrl = true;
      this.hasCustomAuthorizationHeader = false;
      this.suppressGetSessionWarning = false;
      this.lockAcquired = false;
      this.pendingInLock = [];
      this.broadcastChannel = null;
      this.logger = console.log;
      this.instanceID = _GoTrueClient.nextInstanceID;
      _GoTrueClient.nextInstanceID += 1;
      if (this.instanceID > 0 && isBrowser()) {
        console.warn("Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.");
      }
      const settings = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
      this.logDebugMessages = !!settings.debug;
      if (typeof settings.debug === "function") {
        this.logger = settings.debug;
      }
      this.persistSession = settings.persistSession;
      this.storageKey = settings.storageKey;
      this.autoRefreshToken = settings.autoRefreshToken;
      this.admin = new GoTrueAdminApi({
        url: settings.url,
        headers: settings.headers,
        fetch: settings.fetch
      });
      this.url = settings.url;
      this.headers = settings.headers;
      this.fetch = resolveFetch4(settings.fetch);
      this.lock = settings.lock || lockNoOp;
      this.detectSessionInUrl = settings.detectSessionInUrl;
      this.flowType = settings.flowType;
      this.hasCustomAuthorizationHeader = settings.hasCustomAuthorizationHeader;
      if (settings.lock) {
        this.lock = settings.lock;
      } else if (isBrowser() && ((_a = globalThis === null || globalThis === void 0 ? void 0 : globalThis.navigator) === null || _a === void 0 ? void 0 : _a.locks)) {
        this.lock = navigatorLock;
      } else {
        this.lock = lockNoOp;
      }
      this.mfa = {
        verify: this._verify.bind(this),
        enroll: this._enroll.bind(this),
        unenroll: this._unenroll.bind(this),
        challenge: this._challenge.bind(this),
        listFactors: this._listFactors.bind(this),
        challengeAndVerify: this._challengeAndVerify.bind(this),
        getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this)
      };
      if (this.persistSession) {
        if (settings.storage) {
          this.storage = settings.storage;
        } else {
          if (supportsLocalStorage()) {
            this.storage = localStorageAdapter;
          } else {
            this.memoryStorage = {};
            this.storage = memoryLocalStorageAdapter(this.memoryStorage);
          }
        }
      } else {
        this.memoryStorage = {};
        this.storage = memoryLocalStorageAdapter(this.memoryStorage);
      }
      if (isBrowser() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
        try {
          this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
        } catch (e) {
          console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", e);
        }
        (_b = this.broadcastChannel) === null || _b === void 0 ? void 0 : _b.addEventListener("message", async (event) => {
          this._debug("received broadcast notification from other tab or client", event);
          await this._notifyAllSubscribers(event.data.event, event.data.session, false);
        });
      }
      this.initialize();
    }
    _debug(...args) {
      if (this.logDebugMessages) {
        this.logger(`GoTrueClient@${this.instanceID} (${version4}) ${(/* @__PURE__ */ new Date()).toISOString()}`, ...args);
      }
      return this;
    }
    /**
     * Initializes the client session either from the url or from storage.
     * This method is automatically called when instantiating the client, but should also be called
     * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
     */
    async initialize() {
      if (this.initializePromise) {
        return await this.initializePromise;
      }
      this.initializePromise = (async () => {
        return await this._acquireLock(-1, async () => {
          return await this._initialize();
        });
      })();
      return await this.initializePromise;
    }
    /**
     * IMPORTANT:
     * 1. Never throw in this method, as it is called from the constructor
     * 2. Never return a session from this method as it would be cached over
     *    the whole lifetime of the client
     */
    async _initialize() {
      var _a;
      try {
        const params = parseParametersFromURL(window.location.href);
        let callbackUrlType = "none";
        if (this._isImplicitGrantCallback(params)) {
          callbackUrlType = "implicit";
        } else if (await this._isPKCECallback(params)) {
          callbackUrlType = "pkce";
        }
        if (isBrowser() && this.detectSessionInUrl && callbackUrlType !== "none") {
          const { data, error } = await this._getSessionFromURL(params, callbackUrlType);
          if (error) {
            this._debug("#_initialize()", "error detecting session from URL", error);
            if (isAuthImplicitGrantRedirectError(error)) {
              const errorCode = (_a = error.details) === null || _a === void 0 ? void 0 : _a.code;
              if (errorCode === "identity_already_exists" || errorCode === "identity_not_found" || errorCode === "single_identity_not_deletable") {
                return { error };
              }
            }
            await this._removeSession();
            return { error };
          }
          const { session, redirectType } = data;
          this._debug("#_initialize()", "detected session in URL", session, "redirect type", redirectType);
          await this._saveSession(session);
          setTimeout(async () => {
            if (redirectType === "recovery") {
              await this._notifyAllSubscribers("PASSWORD_RECOVERY", session);
            } else {
              await this._notifyAllSubscribers("SIGNED_IN", session);
            }
          }, 0);
          return { error: null };
        }
        await this._recoverAndRefresh();
        return { error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { error };
        }
        return {
          error: new AuthUnknownError("Unexpected error during initialization", error)
        };
      } finally {
        await this._handleVisibilityChange();
        this._debug("#_initialize()", "end");
      }
    }
    /**
     * Creates a new anonymous user.
     *
     * @returns A session where the is_anonymous claim in the access token JWT set to true
     */
    async signInAnonymously(credentials) {
      var _a, _b, _c;
      try {
        const res = await _request(this.fetch, "POST", `${this.url}/signup`, {
          headers: this.headers,
          body: {
            data: (_b = (_a = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : {},
            gotrue_meta_security: { captcha_token: (_c = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _c === void 0 ? void 0 : _c.captchaToken }
          },
          xform: _sessionResponse
        });
        const { data, error } = res;
        if (error || !data) {
          return { data: { user: null, session: null }, error };
        }
        const session = data.session;
        const user = data.user;
        if (data.session) {
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("SIGNED_IN", session);
        }
        return { data: { user, session }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Creates a new user.
     *
     * Be aware that if a user account exists in the system you may get back an
     * error message that attempts to hide this information from the user.
     * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
     *
     * @returns A logged-in session if the server has "autoconfirm" ON
     * @returns A user if the server has "autoconfirm" OFF
     */
    async signUp(credentials) {
      var _a, _b, _c;
      try {
        let res;
        if ("email" in credentials) {
          const { email, password, options } = credentials;
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce") {
            ;
            [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
          }
          res = await _request(this.fetch, "POST", `${this.url}/signup`, {
            headers: this.headers,
            redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
            body: {
              email,
              password,
              data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
              code_challenge: codeChallenge,
              code_challenge_method: codeChallengeMethod
            },
            xform: _sessionResponse
          });
        } else if ("phone" in credentials) {
          const { phone, password, options } = credentials;
          res = await _request(this.fetch, "POST", `${this.url}/signup`, {
            headers: this.headers,
            body: {
              phone,
              password,
              data: (_b = options === null || options === void 0 ? void 0 : options.data) !== null && _b !== void 0 ? _b : {},
              channel: (_c = options === null || options === void 0 ? void 0 : options.channel) !== null && _c !== void 0 ? _c : "sms",
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: _sessionResponse
          });
        } else {
          throw new AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
        }
        const { data, error } = res;
        if (error || !data) {
          return { data: { user: null, session: null }, error };
        }
        const session = data.session;
        const user = data.user;
        if (data.session) {
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("SIGNED_IN", session);
        }
        return { data: { user, session }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Log in an existing user with an email and password or phone and password.
     *
     * Be aware that you may get back an error message that will not distinguish
     * between the cases where the account does not exist or that the
     * email/phone and password combination is wrong or that the account can only
     * be accessed via social login.
     */
    async signInWithPassword(credentials) {
      try {
        let res;
        if ("email" in credentials) {
          const { email, password, options } = credentials;
          res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
            headers: this.headers,
            body: {
              email,
              password,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: _sessionResponsePassword
          });
        } else if ("phone" in credentials) {
          const { phone, password, options } = credentials;
          res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
            headers: this.headers,
            body: {
              phone,
              password,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: _sessionResponsePassword
          });
        } else {
          throw new AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
        }
        const { data, error } = res;
        if (error) {
          return { data: { user: null, session: null }, error };
        } else if (!data || !data.session || !data.user) {
          return { data: { user: null, session: null }, error: new AuthInvalidTokenResponseError() };
        }
        if (data.session) {
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("SIGNED_IN", data.session);
        }
        return {
          data: Object.assign({ user: data.user, session: data.session }, data.weak_password ? { weakPassword: data.weak_password } : null),
          error
        };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Log in an existing user via a third-party provider.
     * This method supports the PKCE flow.
     */
    async signInWithOAuth(credentials) {
      var _a, _b, _c, _d;
      return await this._handleProviderSignIn(credentials.provider, {
        redirectTo: (_a = credentials.options) === null || _a === void 0 ? void 0 : _a.redirectTo,
        scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
        queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
        skipBrowserRedirect: (_d = credentials.options) === null || _d === void 0 ? void 0 : _d.skipBrowserRedirect
      });
    }
    /**
     * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
     */
    async exchangeCodeForSession(authCode) {
      await this.initializePromise;
      return this._acquireLock(-1, async () => {
        return this._exchangeCodeForSession(authCode);
      });
    }
    async _exchangeCodeForSession(authCode) {
      const storageItem = await getItemAsync(this.storage, `${this.storageKey}-code-verifier`);
      const [codeVerifier, redirectType] = (storageItem !== null && storageItem !== void 0 ? storageItem : "").split("/");
      try {
        const { data, error } = await _request(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
          headers: this.headers,
          body: {
            auth_code: authCode,
            code_verifier: codeVerifier
          },
          xform: _sessionResponse
        });
        await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
        if (error) {
          throw error;
        }
        if (!data || !data.session || !data.user) {
          return {
            data: { user: null, session: null, redirectType: null },
            error: new AuthInvalidTokenResponseError()
          };
        }
        if (data.session) {
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("SIGNED_IN", data.session);
        }
        return { data: Object.assign(Object.assign({}, data), { redirectType: redirectType !== null && redirectType !== void 0 ? redirectType : null }), error };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null, redirectType: null }, error };
        }
        throw error;
      }
    }
    /**
     * Allows signing in with an OIDC ID token. The authentication provider used
     * should be enabled and configured.
     */
    async signInWithIdToken(credentials) {
      try {
        const { options, provider, token, access_token, nonce } = credentials;
        const res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
          headers: this.headers,
          body: {
            provider,
            id_token: token,
            access_token,
            nonce,
            gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
          },
          xform: _sessionResponse
        });
        const { data, error } = res;
        if (error) {
          return { data: { user: null, session: null }, error };
        } else if (!data || !data.session || !data.user) {
          return {
            data: { user: null, session: null },
            error: new AuthInvalidTokenResponseError()
          };
        }
        if (data.session) {
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("SIGNED_IN", data.session);
        }
        return { data, error };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Log in a user using magiclink or a one-time password (OTP).
     *
     * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
     * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
     * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
     *
     * Be aware that you may get back an error message that will not distinguish
     * between the cases where the account does not exist or, that the account
     * can only be accessed via social login.
     *
     * Do note that you will need to configure a Whatsapp sender on Twilio
     * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
     * channel is not supported on other providers
     * at this time.
     * This method supports PKCE when an email is passed.
     */
    async signInWithOtp(credentials) {
      var _a, _b, _c, _d, _e;
      try {
        if ("email" in credentials) {
          const { email, options } = credentials;
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce") {
            ;
            [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
          }
          const { error } = await _request(this.fetch, "POST", `${this.url}/otp`, {
            headers: this.headers,
            body: {
              email,
              data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
              create_user: (_b = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _b !== void 0 ? _b : true,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
              code_challenge: codeChallenge,
              code_challenge_method: codeChallengeMethod
            },
            redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
          });
          return { data: { user: null, session: null }, error };
        }
        if ("phone" in credentials) {
          const { phone, options } = credentials;
          const { data, error } = await _request(this.fetch, "POST", `${this.url}/otp`, {
            headers: this.headers,
            body: {
              phone,
              data: (_c = options === null || options === void 0 ? void 0 : options.data) !== null && _c !== void 0 ? _c : {},
              create_user: (_d = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _d !== void 0 ? _d : true,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
              channel: (_e = options === null || options === void 0 ? void 0 : options.channel) !== null && _e !== void 0 ? _e : "sms"
            }
          });
          return { data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id }, error };
        }
        throw new AuthInvalidCredentialsError("You must provide either an email or phone number.");
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
     */
    async verifyOtp(params) {
      var _a, _b;
      try {
        let redirectTo = void 0;
        let captchaToken = void 0;
        if ("options" in params) {
          redirectTo = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo;
          captchaToken = (_b = params.options) === null || _b === void 0 ? void 0 : _b.captchaToken;
        }
        const { data, error } = await _request(this.fetch, "POST", `${this.url}/verify`, {
          headers: this.headers,
          body: Object.assign(Object.assign({}, params), { gotrue_meta_security: { captcha_token: captchaToken } }),
          redirectTo,
          xform: _sessionResponse
        });
        if (error) {
          throw error;
        }
        if (!data) {
          throw new Error("An error occurred on token verification.");
        }
        const session = data.session;
        const user = data.user;
        if (session === null || session === void 0 ? void 0 : session.access_token) {
          await this._saveSession(session);
          await this._notifyAllSubscribers(params.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", session);
        }
        return { data: { user, session }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Attempts a single-sign on using an enterprise Identity Provider. A
     * successful SSO attempt will redirect the current page to the identity
     * provider authorization page. The redirect URL is implementation and SSO
     * protocol specific.
     *
     * You can use it by providing a SSO domain. Typically you can extract this
     * domain by asking users for their email address. If this domain is
     * registered on the Auth instance the redirect will use that organization's
     * currently active SSO Identity Provider for the login.
     *
     * If you have built an organization-specific login page, you can use the
     * organization's SSO Identity Provider UUID directly instead.
     */
    async signInWithSSO(params) {
      var _a, _b, _c;
      try {
        let codeChallenge = null;
        let codeChallengeMethod = null;
        if (this.flowType === "pkce") {
          ;
          [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
        }
        return await _request(this.fetch, "POST", `${this.url}/sso`, {
          body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in params ? { provider_id: params.providerId } : null), "domain" in params ? { domain: params.domain } : null), { redirect_to: (_b = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo) !== null && _b !== void 0 ? _b : void 0 }), ((_c = params === null || params === void 0 ? void 0 : params.options) === null || _c === void 0 ? void 0 : _c.captchaToken) ? { gotrue_meta_security: { captcha_token: params.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
          headers: this.headers,
          xform: _ssoResponse
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    /**
     * Sends a reauthentication OTP to the user's email or phone number.
     * Requires the user to be signed-in.
     */
    async reauthenticate() {
      await this.initializePromise;
      return await this._acquireLock(-1, async () => {
        return await this._reauthenticate();
      });
    }
    async _reauthenticate() {
      try {
        return await this._useSession(async (result) => {
          const { data: { session }, error: sessionError } = result;
          if (sessionError)
            throw sessionError;
          if (!session)
            throw new AuthSessionMissingError();
          const { error } = await _request(this.fetch, "GET", `${this.url}/reauthenticate`, {
            headers: this.headers,
            jwt: session.access_token
          });
          return { data: { user: null, session: null }, error };
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
     */
    async resend(credentials) {
      try {
        const endpoint = `${this.url}/resend`;
        if ("email" in credentials) {
          const { email, type, options } = credentials;
          const { error } = await _request(this.fetch, "POST", endpoint, {
            headers: this.headers,
            body: {
              email,
              type,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
          });
          return { data: { user: null, session: null }, error };
        } else if ("phone" in credentials) {
          const { phone, type, options } = credentials;
          const { data, error } = await _request(this.fetch, "POST", endpoint, {
            headers: this.headers,
            body: {
              phone,
              type,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            }
          });
          return { data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id }, error };
        }
        throw new AuthInvalidCredentialsError("You must provide either an email or phone number and a type");
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Returns the session, refreshing it if necessary.
     *
     * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
     *
     * **IMPORTANT:** This method loads values directly from the storage attached
     * to the client. If that storage is based on request cookies for example,
     * the values in it may not be authentic and therefore it's strongly advised
     * against using this method and its results in such circumstances. A warning
     * will be emitted if this is detected. Use {@link #getUser()} instead.
     */
    async getSession() {
      await this.initializePromise;
      const result = await this._acquireLock(-1, async () => {
        return this._useSession(async (result2) => {
          return result2;
        });
      });
      return result;
    }
    /**
     * Acquires a global lock based on the storage key.
     */
    async _acquireLock(acquireTimeout, fn) {
      this._debug("#_acquireLock", "begin", acquireTimeout);
      try {
        if (this.lockAcquired) {
          const last = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve();
          const result = (async () => {
            await last;
            return await fn();
          })();
          this.pendingInLock.push((async () => {
            try {
              await result;
            } catch (e) {
            }
          })());
          return result;
        }
        return await this.lock(`lock:${this.storageKey}`, acquireTimeout, async () => {
          this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
          try {
            this.lockAcquired = true;
            const result = fn();
            this.pendingInLock.push((async () => {
              try {
                await result;
              } catch (e) {
              }
            })());
            await result;
            while (this.pendingInLock.length) {
              const waitOn = [...this.pendingInLock];
              await Promise.all(waitOn);
              this.pendingInLock.splice(0, waitOn.length);
            }
            return await result;
          } finally {
            this._debug("#_acquireLock", "lock released for storage key", this.storageKey);
            this.lockAcquired = false;
          }
        });
      } finally {
        this._debug("#_acquireLock", "end");
      }
    }
    /**
     * Use instead of {@link #getSession} inside the library. It is
     * semantically usually what you want, as getting a session involves some
     * processing afterwards that requires only one client operating on the
     * session at once across multiple tabs or processes.
     */
    async _useSession(fn) {
      this._debug("#_useSession", "begin");
      try {
        const result = await this.__loadSession();
        return await fn(result);
      } finally {
        this._debug("#_useSession", "end");
      }
    }
    /**
     * NEVER USE DIRECTLY!
     *
     * Always use {@link #_useSession}.
     */
    async __loadSession() {
      this._debug("#__loadSession()", "begin");
      if (!this.lockAcquired) {
        this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
      }
      try {
        let currentSession = null;
        const maybeSession = await getItemAsync(this.storage, this.storageKey);
        this._debug("#getSession()", "session from storage", maybeSession);
        if (maybeSession !== null) {
          if (this._isValidSession(maybeSession)) {
            currentSession = maybeSession;
          } else {
            this._debug("#getSession()", "session from storage is not valid");
            await this._removeSession();
          }
        }
        if (!currentSession) {
          return { data: { session: null }, error: null };
        }
        const hasExpired = currentSession.expires_at ? currentSession.expires_at <= Date.now() / 1e3 : false;
        this._debug("#__loadSession()", `session has${hasExpired ? "" : " not"} expired`, "expires_at", currentSession.expires_at);
        if (!hasExpired) {
          if (this.storage.isServer) {
            let suppressWarning = this.suppressGetSessionWarning;
            const proxySession = new Proxy(currentSession, {
              get: (target, prop, receiver) => {
                if (!suppressWarning && prop === "user") {
                  console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server.");
                  suppressWarning = true;
                  this.suppressGetSessionWarning = true;
                }
                return Reflect.get(target, prop, receiver);
              }
            });
            currentSession = proxySession;
          }
          return { data: { session: currentSession }, error: null };
        }
        const { session, error } = await this._callRefreshToken(currentSession.refresh_token);
        if (error) {
          return { data: { session: null }, error };
        }
        return { data: { session }, error: null };
      } finally {
        this._debug("#__loadSession()", "end");
      }
    }
    /**
     * Gets the current user details if there is an existing session. This method
     * performs a network request to the Supabase Auth server, so the returned
     * value is authentic and can be used to base authorization rules on.
     *
     * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
     */
    async getUser(jwt) {
      if (jwt) {
        return await this._getUser(jwt);
      }
      await this.initializePromise;
      const result = await this._acquireLock(-1, async () => {
        return await this._getUser();
      });
      return result;
    }
    async _getUser(jwt) {
      try {
        if (jwt) {
          return await _request(this.fetch, "GET", `${this.url}/user`, {
            headers: this.headers,
            jwt,
            xform: _userResponse
          });
        }
        return await this._useSession(async (result) => {
          var _a, _b, _c;
          const { data, error } = result;
          if (error) {
            throw error;
          }
          if (!((_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) && !this.hasCustomAuthorizationHeader) {
            return { data: { user: null }, error: new AuthSessionMissingError() };
          }
          return await _request(this.fetch, "GET", `${this.url}/user`, {
            headers: this.headers,
            jwt: (_c = (_b = data.session) === null || _b === void 0 ? void 0 : _b.access_token) !== null && _c !== void 0 ? _c : void 0,
            xform: _userResponse
          });
        });
      } catch (error) {
        if (isAuthError(error)) {
          if (isAuthSessionMissingError(error)) {
            await this._removeSession();
            await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          }
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Updates user data for a logged in user.
     */
    async updateUser(attributes, options = {}) {
      await this.initializePromise;
      return await this._acquireLock(-1, async () => {
        return await this._updateUser(attributes, options);
      });
    }
    async _updateUser(attributes, options = {}) {
      try {
        return await this._useSession(async (result) => {
          const { data: sessionData, error: sessionError } = result;
          if (sessionError) {
            throw sessionError;
          }
          if (!sessionData.session) {
            throw new AuthSessionMissingError();
          }
          const session = sessionData.session;
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce" && attributes.email != null) {
            ;
            [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
          }
          const { data, error: userError } = await _request(this.fetch, "PUT", `${this.url}/user`, {
            headers: this.headers,
            redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
            body: Object.assign(Object.assign({}, attributes), { code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
            jwt: session.access_token,
            xform: _userResponse
          });
          if (userError)
            throw userError;
          session.user = data.user;
          await this._saveSession(session);
          await this._notifyAllSubscribers("USER_UPDATED", session);
          return { data: { user: session.user }, error: null };
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Decodes a JWT (without performing any validation).
     */
    _decodeJWT(jwt) {
      return decodeJWTPayload(jwt);
    }
    /**
     * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
     * If the refresh token or access token in the current session is invalid, an error will be thrown.
     * @param currentSession The current session that minimally contains an access token and refresh token.
     */
    async setSession(currentSession) {
      await this.initializePromise;
      return await this._acquireLock(-1, async () => {
        return await this._setSession(currentSession);
      });
    }
    async _setSession(currentSession) {
      try {
        if (!currentSession.access_token || !currentSession.refresh_token) {
          throw new AuthSessionMissingError();
        }
        const timeNow = Date.now() / 1e3;
        let expiresAt2 = timeNow;
        let hasExpired = true;
        let session = null;
        const payload = decodeJWTPayload(currentSession.access_token);
        if (payload.exp) {
          expiresAt2 = payload.exp;
          hasExpired = expiresAt2 <= timeNow;
        }
        if (hasExpired) {
          const { session: refreshedSession, error } = await this._callRefreshToken(currentSession.refresh_token);
          if (error) {
            return { data: { user: null, session: null }, error };
          }
          if (!refreshedSession) {
            return { data: { user: null, session: null }, error: null };
          }
          session = refreshedSession;
        } else {
          const { data, error } = await this._getUser(currentSession.access_token);
          if (error) {
            throw error;
          }
          session = {
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token,
            user: data.user,
            token_type: "bearer",
            expires_in: expiresAt2 - timeNow,
            expires_at: expiresAt2
          };
          await this._saveSession(session);
          await this._notifyAllSubscribers("SIGNED_IN", session);
        }
        return { data: { user: session.user, session }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { session: null, user: null }, error };
        }
        throw error;
      }
    }
    /**
     * Returns a new session, regardless of expiry status.
     * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
     * If the current session's refresh token is invalid, an error will be thrown.
     * @param currentSession The current session. If passed in, it must contain a refresh token.
     */
    async refreshSession(currentSession) {
      await this.initializePromise;
      return await this._acquireLock(-1, async () => {
        return await this._refreshSession(currentSession);
      });
    }
    async _refreshSession(currentSession) {
      try {
        return await this._useSession(async (result) => {
          var _a;
          if (!currentSession) {
            const { data, error: error2 } = result;
            if (error2) {
              throw error2;
            }
            currentSession = (_a = data.session) !== null && _a !== void 0 ? _a : void 0;
          }
          if (!(currentSession === null || currentSession === void 0 ? void 0 : currentSession.refresh_token)) {
            throw new AuthSessionMissingError();
          }
          const { session, error } = await this._callRefreshToken(currentSession.refresh_token);
          if (error) {
            return { data: { user: null, session: null }, error };
          }
          if (!session) {
            return { data: { user: null, session: null }, error: null };
          }
          return { data: { user: session.user, session }, error: null };
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { user: null, session: null }, error };
        }
        throw error;
      }
    }
    /**
     * Gets the session data from a URL string
     */
    async _getSessionFromURL(params, callbackUrlType) {
      try {
        if (!isBrowser())
          throw new AuthImplicitGrantRedirectError("No browser detected.");
        if (params.error || params.error_description || params.error_code) {
          throw new AuthImplicitGrantRedirectError(params.error_description || "Error in URL with unspecified error_description", {
            error: params.error || "unspecified_error",
            code: params.error_code || "unspecified_code"
          });
        }
        switch (callbackUrlType) {
          case "implicit":
            if (this.flowType === "pkce") {
              throw new AuthPKCEGrantCodeExchangeError("Not a valid PKCE flow url.");
            }
            break;
          case "pkce":
            if (this.flowType === "implicit") {
              throw new AuthImplicitGrantRedirectError("Not a valid implicit grant flow url.");
            }
            break;
          default:
        }
        if (callbackUrlType === "pkce") {
          this._debug("#_initialize()", "begin", "is PKCE flow", true);
          if (!params.code)
            throw new AuthPKCEGrantCodeExchangeError("No code detected.");
          const { data: data2, error: error2 } = await this._exchangeCodeForSession(params.code);
          if (error2)
            throw error2;
          const url = new URL(window.location.href);
          url.searchParams.delete("code");
          window.history.replaceState(window.history.state, "", url.toString());
          return { data: { session: data2.session, redirectType: null }, error: null };
        }
        const { provider_token, provider_refresh_token, access_token, refresh_token, expires_in, expires_at, token_type } = params;
        if (!access_token || !expires_in || !refresh_token || !token_type) {
          throw new AuthImplicitGrantRedirectError("No session defined in URL");
        }
        const timeNow = Math.round(Date.now() / 1e3);
        const expiresIn = parseInt(expires_in);
        let expiresAt2 = timeNow + expiresIn;
        if (expires_at) {
          expiresAt2 = parseInt(expires_at);
        }
        const actuallyExpiresIn = expiresAt2 - timeNow;
        if (actuallyExpiresIn * 1e3 <= AUTO_REFRESH_TICK_DURATION) {
          console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${actuallyExpiresIn}s, should have been closer to ${expiresIn}s`);
        }
        const issuedAt = expiresAt2 - expiresIn;
        if (timeNow - issuedAt >= 120) {
          console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", issuedAt, expiresAt2, timeNow);
        } else if (timeNow - issuedAt < 0) {
          console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", issuedAt, expiresAt2, timeNow);
        }
        const { data, error } = await this._getUser(access_token);
        if (error)
          throw error;
        const session = {
          provider_token,
          provider_refresh_token,
          access_token,
          expires_in: expiresIn,
          expires_at: expiresAt2,
          refresh_token,
          token_type,
          user: data.user
        };
        window.location.hash = "";
        this._debug("#_getSessionFromURL()", "clearing window.location.hash");
        return { data: { session, redirectType: params.type }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { session: null, redirectType: null }, error };
        }
        throw error;
      }
    }
    /**
     * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
     */
    _isImplicitGrantCallback(params) {
      return Boolean(params.access_token || params.error_description);
    }
    /**
     * Checks if the current URL and backing storage contain parameters given by a PKCE flow
     */
    async _isPKCECallback(params) {
      const currentStorageContent = await getItemAsync(this.storage, `${this.storageKey}-code-verifier`);
      return !!(params.code && currentStorageContent);
    }
    /**
     * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
     *
     * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
     * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
     *
     * If using `others` scope, no `SIGNED_OUT` event is fired!
     */
    async signOut(options = { scope: "global" }) {
      await this.initializePromise;
      return await this._acquireLock(-1, async () => {
        return await this._signOut(options);
      });
    }
    async _signOut({ scope } = { scope: "global" }) {
      return await this._useSession(async (result) => {
        var _a;
        const { data, error: sessionError } = result;
        if (sessionError) {
          return { error: sessionError };
        }
        const accessToken = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
        if (accessToken) {
          const { error } = await this.admin.signOut(accessToken, scope);
          if (error) {
            if (!(isAuthApiError(error) && (error.status === 404 || error.status === 401 || error.status === 403))) {
              return { error };
            }
          }
        }
        if (scope !== "others") {
          await this._removeSession();
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
        }
        return { error: null };
      });
    }
    /**
     * Receive a notification every time an auth event happens.
     * @param callback A callback function to be invoked when an auth event happens.
     */
    onAuthStateChange(callback) {
      const id = uuid();
      const subscription = {
        id,
        callback,
        unsubscribe: () => {
          this._debug("#unsubscribe()", "state change callback with id removed", id);
          this.stateChangeEmitters.delete(id);
        }
      };
      this._debug("#onAuthStateChange()", "registered callback with id", id);
      this.stateChangeEmitters.set(id, subscription);
      (async () => {
        await this.initializePromise;
        await this._acquireLock(-1, async () => {
          this._emitInitialSession(id);
        });
      })();
      return { data: { subscription } };
    }
    async _emitInitialSession(id) {
      return await this._useSession(async (result) => {
        var _a, _b;
        try {
          const { data: { session }, error } = result;
          if (error)
            throw error;
          await ((_a = this.stateChangeEmitters.get(id)) === null || _a === void 0 ? void 0 : _a.callback("INITIAL_SESSION", session));
          this._debug("INITIAL_SESSION", "callback id", id, "session", session);
        } catch (err) {
          await ((_b = this.stateChangeEmitters.get(id)) === null || _b === void 0 ? void 0 : _b.callback("INITIAL_SESSION", null));
          this._debug("INITIAL_SESSION", "callback id", id, "error", err);
          console.error(err);
        }
      });
    }
    /**
     * Sends a password reset request to an email address. This method supports the PKCE flow.
     *
     * @param email The email address of the user.
     * @param options.redirectTo The URL to send the user to after they click the password reset link.
     * @param options.captchaToken Verification token received when the user completes the captcha on the site.
     */
    async resetPasswordForEmail(email, options = {}) {
      let codeChallenge = null;
      let codeChallengeMethod = null;
      if (this.flowType === "pkce") {
        ;
        [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(
          this.storage,
          this.storageKey,
          true
          // isPasswordRecovery
        );
      }
      try {
        return await _request(this.fetch, "POST", `${this.url}/recover`, {
          body: {
            email,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
            gotrue_meta_security: { captcha_token: options.captchaToken }
          },
          headers: this.headers,
          redirectTo: options.redirectTo
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    /**
     * Gets all the identities linked to a user.
     */
    async getUserIdentities() {
      var _a;
      try {
        const { data, error } = await this.getUser();
        if (error)
          throw error;
        return { data: { identities: (_a = data.user.identities) !== null && _a !== void 0 ? _a : [] }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    /**
     * Links an oauth identity to an existing user.
     * This method supports the PKCE flow.
     */
    async linkIdentity(credentials) {
      var _a;
      try {
        const { data, error } = await this._useSession(async (result) => {
          var _a2, _b, _c, _d, _e;
          const { data: data2, error: error2 } = result;
          if (error2)
            throw error2;
          const url = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, credentials.provider, {
            redirectTo: (_a2 = credentials.options) === null || _a2 === void 0 ? void 0 : _a2.redirectTo,
            scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
            queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
            skipBrowserRedirect: true
          });
          return await _request(this.fetch, "GET", url, {
            headers: this.headers,
            jwt: (_e = (_d = data2.session) === null || _d === void 0 ? void 0 : _d.access_token) !== null && _e !== void 0 ? _e : void 0
          });
        });
        if (error)
          throw error;
        if (isBrowser() && !((_a = credentials.options) === null || _a === void 0 ? void 0 : _a.skipBrowserRedirect)) {
          window.location.assign(data === null || data === void 0 ? void 0 : data.url);
        }
        return { data: { provider: credentials.provider, url: data === null || data === void 0 ? void 0 : data.url }, error: null };
      } catch (error) {
        if (isAuthError(error)) {
          return { data: { provider: credentials.provider, url: null }, error };
        }
        throw error;
      }
    }
    /**
     * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
     */
    async unlinkIdentity(identity) {
      try {
        return await this._useSession(async (result) => {
          var _a, _b;
          const { data, error } = result;
          if (error) {
            throw error;
          }
          return await _request(this.fetch, "DELETE", `${this.url}/user/identities/${identity.identity_id}`, {
            headers: this.headers,
            jwt: (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : void 0
          });
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    /**
     * Generates a new JWT.
     * @param refreshToken A valid refresh token that was returned on login.
     */
    async _refreshAccessToken(refreshToken) {
      const debugName = `#_refreshAccessToken(${refreshToken.substring(0, 5)}...)`;
      this._debug(debugName, "begin");
      try {
        const startedAt = Date.now();
        return await retryable(async (attempt) => {
          if (attempt > 0) {
            await sleep(200 * Math.pow(2, attempt - 1));
          }
          this._debug(debugName, "refreshing attempt", attempt);
          return await _request(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
            body: { refresh_token: refreshToken },
            headers: this.headers,
            xform: _sessionResponse
          });
        }, (attempt, error) => {
          const nextBackOffInterval = 200 * Math.pow(2, attempt);
          return error && isAuthRetryableFetchError(error) && // retryable only if the request can be sent before the backoff overflows the tick duration
          Date.now() + nextBackOffInterval - startedAt < AUTO_REFRESH_TICK_DURATION;
        });
      } catch (error) {
        this._debug(debugName, "error", error);
        if (isAuthError(error)) {
          return { data: { session: null, user: null }, error };
        }
        throw error;
      } finally {
        this._debug(debugName, "end");
      }
    }
    _isValidSession(maybeSession) {
      const isValidSession = typeof maybeSession === "object" && maybeSession !== null && "access_token" in maybeSession && "refresh_token" in maybeSession && "expires_at" in maybeSession;
      return isValidSession;
    }
    async _handleProviderSignIn(provider, options) {
      const url = await this._getUrlForProvider(`${this.url}/authorize`, provider, {
        redirectTo: options.redirectTo,
        scopes: options.scopes,
        queryParams: options.queryParams
      });
      this._debug("#_handleProviderSignIn()", "provider", provider, "options", options, "url", url);
      if (isBrowser() && !options.skipBrowserRedirect) {
        window.location.assign(url);
      }
      return { data: { provider, url }, error: null };
    }
    /**
     * Recovers the session from LocalStorage and refreshes the token
     * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
     */
    async _recoverAndRefresh() {
      var _a;
      const debugName = "#_recoverAndRefresh()";
      this._debug(debugName, "begin");
      try {
        const currentSession = await getItemAsync(this.storage, this.storageKey);
        this._debug(debugName, "session from storage", currentSession);
        if (!this._isValidSession(currentSession)) {
          this._debug(debugName, "session is not valid");
          if (currentSession !== null) {
            await this._removeSession();
          }
          return;
        }
        const timeNow = Math.round(Date.now() / 1e3);
        const expiresWithMargin = ((_a = currentSession.expires_at) !== null && _a !== void 0 ? _a : Infinity) < timeNow + EXPIRY_MARGIN;
        this._debug(debugName, `session has${expiresWithMargin ? "" : " not"} expired with margin of ${EXPIRY_MARGIN}s`);
        if (expiresWithMargin) {
          if (this.autoRefreshToken && currentSession.refresh_token) {
            const { error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              console.error(error);
              if (!isAuthRetryableFetchError(error)) {
                this._debug(debugName, "refresh failed with a non-retryable error, removing the session", error);
                await this._removeSession();
              }
            }
          }
        } else {
          await this._notifyAllSubscribers("SIGNED_IN", currentSession);
        }
      } catch (err) {
        this._debug(debugName, "error", err);
        console.error(err);
        return;
      } finally {
        this._debug(debugName, "end");
      }
    }
    async _callRefreshToken(refreshToken) {
      var _a, _b;
      if (!refreshToken) {
        throw new AuthSessionMissingError();
      }
      if (this.refreshingDeferred) {
        return this.refreshingDeferred.promise;
      }
      const debugName = `#_callRefreshToken(${refreshToken.substring(0, 5)}...)`;
      this._debug(debugName, "begin");
      try {
        this.refreshingDeferred = new Deferred();
        const { data, error } = await this._refreshAccessToken(refreshToken);
        if (error)
          throw error;
        if (!data.session)
          throw new AuthSessionMissingError();
        await this._saveSession(data.session);
        await this._notifyAllSubscribers("TOKEN_REFRESHED", data.session);
        const result = { session: data.session, error: null };
        this.refreshingDeferred.resolve(result);
        return result;
      } catch (error) {
        this._debug(debugName, "error", error);
        if (isAuthError(error)) {
          const result = { session: null, error };
          if (!isAuthRetryableFetchError(error)) {
            await this._removeSession();
          }
          (_a = this.refreshingDeferred) === null || _a === void 0 ? void 0 : _a.resolve(result);
          return result;
        }
        (_b = this.refreshingDeferred) === null || _b === void 0 ? void 0 : _b.reject(error);
        throw error;
      } finally {
        this.refreshingDeferred = null;
        this._debug(debugName, "end");
      }
    }
    async _notifyAllSubscribers(event, session, broadcast = true) {
      const debugName = `#_notifyAllSubscribers(${event})`;
      this._debug(debugName, "begin", session, `broadcast = ${broadcast}`);
      try {
        if (this.broadcastChannel && broadcast) {
          this.broadcastChannel.postMessage({ event, session });
        }
        const errors = [];
        const promises = Array.from(this.stateChangeEmitters.values()).map(async (x) => {
          try {
            await x.callback(event, session);
          } catch (e) {
            errors.push(e);
          }
        });
        await Promise.all(promises);
        if (errors.length > 0) {
          for (let i = 0; i < errors.length; i += 1) {
            console.error(errors[i]);
          }
          throw errors[0];
        }
      } finally {
        this._debug(debugName, "end");
      }
    }
    /**
     * set currentSession and currentUser
     * process to _startAutoRefreshToken if possible
     */
    async _saveSession(session) {
      this._debug("#_saveSession()", session);
      this.suppressGetSessionWarning = true;
      await setItemAsync(this.storage, this.storageKey, session);
    }
    async _removeSession() {
      this._debug("#_removeSession()");
      await removeItemAsync(this.storage, this.storageKey);
      await this._notifyAllSubscribers("SIGNED_OUT", null);
    }
    /**
     * Removes any registered visibilitychange callback.
     *
     * {@see #startAutoRefresh}
     * {@see #stopAutoRefresh}
     */
    _removeVisibilityChangedCallback() {
      this._debug("#_removeVisibilityChangedCallback()");
      const callback = this.visibilityChangedCallback;
      this.visibilityChangedCallback = null;
      try {
        if (callback && isBrowser() && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
          window.removeEventListener("visibilitychange", callback);
        }
      } catch (e) {
        console.error("removing visibilitychange callback failed", e);
      }
    }
    /**
     * This is the private implementation of {@link #startAutoRefresh}. Use this
     * within the library.
     */
    async _startAutoRefresh() {
      await this._stopAutoRefresh();
      this._debug("#_startAutoRefresh()");
      const ticker = setInterval(() => this._autoRefreshTokenTick(), AUTO_REFRESH_TICK_DURATION);
      this.autoRefreshTicker = ticker;
      if (ticker && typeof ticker === "object" && typeof ticker.unref === "function") {
        ticker.unref();
      } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
        Deno.unrefTimer(ticker);
      }
      setTimeout(async () => {
        await this.initializePromise;
        await this._autoRefreshTokenTick();
      }, 0);
    }
    /**
     * This is the private implementation of {@link #stopAutoRefresh}. Use this
     * within the library.
     */
    async _stopAutoRefresh() {
      this._debug("#_stopAutoRefresh()");
      const ticker = this.autoRefreshTicker;
      this.autoRefreshTicker = null;
      if (ticker) {
        clearInterval(ticker);
      }
    }
    /**
     * Starts an auto-refresh process in the background. The session is checked
     * every few seconds. Close to the time of expiration a process is started to
     * refresh the session. If refreshing fails it will be retried for as long as
     * necessary.
     *
     * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
     * to call this function, it will be called for you.
     *
     * On browsers the refresh process works only when the tab/window is in the
     * foreground to conserve resources as well as prevent race conditions and
     * flooding auth with requests. If you call this method any managed
     * visibility change callback will be removed and you must manage visibility
     * changes on your own.
     *
     * On non-browser platforms the refresh process works *continuously* in the
     * background, which may not be desirable. You should hook into your
     * platform's foreground indication mechanism and call these methods
     * appropriately to conserve resources.
     *
     * {@see #stopAutoRefresh}
     */
    async startAutoRefresh() {
      this._removeVisibilityChangedCallback();
      await this._startAutoRefresh();
    }
    /**
     * Stops an active auto refresh process running in the background (if any).
     *
     * If you call this method any managed visibility change callback will be
     * removed and you must manage visibility changes on your own.
     *
     * See {@link #startAutoRefresh} for more details.
     */
    async stopAutoRefresh() {
      this._removeVisibilityChangedCallback();
      await this._stopAutoRefresh();
    }
    /**
     * Runs the auto refresh token tick.
     */
    async _autoRefreshTokenTick() {
      this._debug("#_autoRefreshTokenTick()", "begin");
      try {
        await this._acquireLock(0, async () => {
          try {
            const now = Date.now();
            try {
              return await this._useSession(async (result) => {
                const { data: { session } } = result;
                if (!session || !session.refresh_token || !session.expires_at) {
                  this._debug("#_autoRefreshTokenTick()", "no session");
                  return;
                }
                const expiresInTicks = Math.floor((session.expires_at * 1e3 - now) / AUTO_REFRESH_TICK_DURATION);
                this._debug("#_autoRefreshTokenTick()", `access token expires in ${expiresInTicks} ticks, a tick lasts ${AUTO_REFRESH_TICK_DURATION}ms, refresh threshold is ${AUTO_REFRESH_TICK_THRESHOLD} ticks`);
                if (expiresInTicks <= AUTO_REFRESH_TICK_THRESHOLD) {
                  await this._callRefreshToken(session.refresh_token);
                }
              });
            } catch (e) {
              console.error("Auto refresh tick failed with error. This is likely a transient error.", e);
            }
          } finally {
            this._debug("#_autoRefreshTokenTick()", "end");
          }
        });
      } catch (e) {
        if (e.isAcquireTimeout || e instanceof LockAcquireTimeoutError) {
          this._debug("auto refresh token tick lock not available");
        } else {
          throw e;
        }
      }
    }
    /**
     * Registers callbacks on the browser / platform, which in-turn run
     * algorithms when the browser window/tab are in foreground. On non-browser
     * platforms it assumes always foreground.
     */
    async _handleVisibilityChange() {
      this._debug("#_handleVisibilityChange()");
      if (!isBrowser() || !(window === null || window === void 0 ? void 0 : window.addEventListener)) {
        if (this.autoRefreshToken) {
          this.startAutoRefresh();
        }
        return false;
      }
      try {
        this.visibilityChangedCallback = async () => await this._onVisibilityChanged(false);
        window === null || window === void 0 ? void 0 : window.addEventListener("visibilitychange", this.visibilityChangedCallback);
        await this._onVisibilityChanged(true);
      } catch (error) {
        console.error("_handleVisibilityChange", error);
      }
    }
    /**
     * Callback registered with `window.addEventListener('visibilitychange')`.
     */
    async _onVisibilityChanged(calledFromInitialize) {
      const methodName = `#_onVisibilityChanged(${calledFromInitialize})`;
      this._debug(methodName, "visibilityState", document.visibilityState);
      if (document.visibilityState === "visible") {
        if (this.autoRefreshToken) {
          this._startAutoRefresh();
        }
        if (!calledFromInitialize) {
          await this.initializePromise;
          await this._acquireLock(-1, async () => {
            if (document.visibilityState !== "visible") {
              this._debug(methodName, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
              return;
            }
            await this._recoverAndRefresh();
          });
        }
      } else if (document.visibilityState === "hidden") {
        if (this.autoRefreshToken) {
          this._stopAutoRefresh();
        }
      }
    }
    /**
     * Generates the relevant login URL for a third-party provider.
     * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
     * @param options.scopes A space-separated list of scopes granted to the OAuth application.
     * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
     */
    async _getUrlForProvider(url, provider, options) {
      const urlParams = [`provider=${encodeURIComponent(provider)}`];
      if (options === null || options === void 0 ? void 0 : options.redirectTo) {
        urlParams.push(`redirect_to=${encodeURIComponent(options.redirectTo)}`);
      }
      if (options === null || options === void 0 ? void 0 : options.scopes) {
        urlParams.push(`scopes=${encodeURIComponent(options.scopes)}`);
      }
      if (this.flowType === "pkce") {
        const [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
        const flowParams = new URLSearchParams({
          code_challenge: `${encodeURIComponent(codeChallenge)}`,
          code_challenge_method: `${encodeURIComponent(codeChallengeMethod)}`
        });
        urlParams.push(flowParams.toString());
      }
      if (options === null || options === void 0 ? void 0 : options.queryParams) {
        const query = new URLSearchParams(options.queryParams);
        urlParams.push(query.toString());
      }
      if (options === null || options === void 0 ? void 0 : options.skipBrowserRedirect) {
        urlParams.push(`skip_http_redirect=${options.skipBrowserRedirect}`);
      }
      return `${url}?${urlParams.join("&")}`;
    }
    async _unenroll(params) {
      try {
        return await this._useSession(async (result) => {
          var _a;
          const { data: sessionData, error: sessionError } = result;
          if (sessionError) {
            return { data: null, error: sessionError };
          }
          return await _request(this.fetch, "DELETE", `${this.url}/factors/${params.factorId}`, {
            headers: this.headers,
            jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
          });
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    async _enroll(params) {
      try {
        return await this._useSession(async (result) => {
          var _a, _b;
          const { data: sessionData, error: sessionError } = result;
          if (sessionError) {
            return { data: null, error: sessionError };
          }
          const body = Object.assign({ friendly_name: params.friendlyName, factor_type: params.factorType }, params.factorType === "phone" ? { phone: params.phone } : { issuer: params.issuer });
          const { data, error } = await _request(this.fetch, "POST", `${this.url}/factors`, {
            body,
            headers: this.headers,
            jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
          });
          if (error) {
            return { data: null, error };
          }
          if (params.factorType === "totp" && ((_b = data === null || data === void 0 ? void 0 : data.totp) === null || _b === void 0 ? void 0 : _b.qr_code)) {
            data.totp.qr_code = `data:image/svg+xml;utf-8,${data.totp.qr_code}`;
          }
          return { data, error: null };
        });
      } catch (error) {
        if (isAuthError(error)) {
          return { data: null, error };
        }
        throw error;
      }
    }
    /**
     * {@see GoTrueMFAApi#verify}
     */
    async _verify(params) {
      return this._acquireLock(-1, async () => {
        try {
          return await this._useSession(async (result) => {
            var _a;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return { data: null, error: sessionError };
            }
            const { data, error } = await _request(this.fetch, "POST", `${this.url}/factors/${params.factorId}/verify`, {
              body: { code: params.code, challenge_id: params.challengeId },
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
            if (error) {
              return { data: null, error };
            }
            await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + data.expires_in }, data));
            await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", data);
            return { data, error };
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * {@see GoTrueMFAApi#challenge}
     */
    async _challenge(params) {
      return this._acquireLock(-1, async () => {
        try {
          return await this._useSession(async (result) => {
            var _a;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return { data: null, error: sessionError };
            }
            return await _request(this.fetch, "POST", `${this.url}/factors/${params.factorId}/challenge`, {
              body: { channel: params.channel },
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      });
    }
    /**
     * {@see GoTrueMFAApi#challengeAndVerify}
     */
    async _challengeAndVerify(params) {
      const { data: challengeData, error: challengeError } = await this._challenge({
        factorId: params.factorId
      });
      if (challengeError) {
        return { data: null, error: challengeError };
      }
      return await this._verify({
        factorId: params.factorId,
        challengeId: challengeData.id,
        code: params.code
      });
    }
    /**
     * {@see GoTrueMFAApi#listFactors}
     */
    async _listFactors() {
      const { data: { user }, error: userError } = await this.getUser();
      if (userError) {
        return { data: null, error: userError };
      }
      const factors = (user === null || user === void 0 ? void 0 : user.factors) || [];
      const totp = factors.filter((factor) => factor.factor_type === "totp" && factor.status === "verified");
      const phone = factors.filter((factor) => factor.factor_type === "phone" && factor.status === "verified");
      return {
        data: {
          all: factors,
          totp,
          phone
        },
        error: null
      };
    }
    /**
     * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
     */
    async _getAuthenticatorAssuranceLevel() {
      return this._acquireLock(-1, async () => {
        return await this._useSession(async (result) => {
          var _a, _b;
          const { data: { session }, error: sessionError } = result;
          if (sessionError) {
            return { data: null, error: sessionError };
          }
          if (!session) {
            return {
              data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
              error: null
            };
          }
          const payload = this._decodeJWT(session.access_token);
          let currentLevel = null;
          if (payload.aal) {
            currentLevel = payload.aal;
          }
          let nextLevel = currentLevel;
          const verifiedFactors = (_b = (_a = session.user.factors) === null || _a === void 0 ? void 0 : _a.filter((factor) => factor.status === "verified")) !== null && _b !== void 0 ? _b : [];
          if (verifiedFactors.length > 0) {
            nextLevel = "aal2";
          }
          const currentAuthenticationMethods = payload.amr || [];
          return { data: { currentLevel, nextLevel, currentAuthenticationMethods }, error: null };
        });
      });
    }
  };
  GoTrueClient.nextInstanceID = 0;

  // node_modules/@supabase/auth-js/dist/module/AuthClient.js
  var AuthClient = GoTrueClient;
  var AuthClient_default = AuthClient;

  // node_modules/@supabase/supabase-js/dist/module/lib/SupabaseAuthClient.js
  var SupabaseAuthClient = class extends AuthClient_default {
    constructor(options) {
      super(options);
    }
  };

  // node_modules/@supabase/supabase-js/dist/module/SupabaseClient.js
  var __awaiter8 = function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  var SupabaseClient = class {
    /**
     * Create a new client for use in the browser.
     * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
     * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
     * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
     * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
     * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
     * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
     * @param options.realtime Options passed along to realtime-js constructor.
     * @param options.global.fetch A custom fetch implementation.
     * @param options.global.headers Any additional headers to send with each network request.
     */
    constructor(supabaseUrl, supabaseKey, options) {
      var _a, _b, _c;
      this.supabaseUrl = supabaseUrl;
      this.supabaseKey = supabaseKey;
      if (!supabaseUrl)
        throw new Error("supabaseUrl is required.");
      if (!supabaseKey)
        throw new Error("supabaseKey is required.");
      const _supabaseUrl = stripTrailingSlash(supabaseUrl);
      this.realtimeUrl = `${_supabaseUrl}/realtime/v1`.replace(/^http/i, "ws");
      this.authUrl = `${_supabaseUrl}/auth/v1`;
      this.storageUrl = `${_supabaseUrl}/storage/v1`;
      this.functionsUrl = `${_supabaseUrl}/functions/v1`;
      const defaultStorageKey = `sb-${new URL(this.authUrl).hostname.split(".")[0]}-auth-token`;
      const DEFAULTS = {
        db: DEFAULT_DB_OPTIONS,
        realtime: DEFAULT_REALTIME_OPTIONS,
        auth: Object.assign(Object.assign({}, DEFAULT_AUTH_OPTIONS), { storageKey: defaultStorageKey }),
        global: DEFAULT_GLOBAL_OPTIONS
      };
      const settings = applySettingDefaults(options !== null && options !== void 0 ? options : {}, DEFAULTS);
      this.storageKey = (_a = settings.auth.storageKey) !== null && _a !== void 0 ? _a : "";
      this.headers = (_b = settings.global.headers) !== null && _b !== void 0 ? _b : {};
      if (!settings.accessToken) {
        this.auth = this._initSupabaseAuthClient((_c = settings.auth) !== null && _c !== void 0 ? _c : {}, this.headers, settings.global.fetch);
      } else {
        this.accessToken = settings.accessToken;
        this.auth = new Proxy({}, {
          get: (_, prop) => {
            throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
          }
        });
      }
      this.fetch = fetchWithAuth(supabaseKey, this._getAccessToken.bind(this), settings.global.fetch);
      this.realtime = this._initRealtimeClient(Object.assign({ headers: this.headers, accessToken: this._getAccessToken.bind(this) }, settings.realtime));
      this.rest = new PostgrestClient(`${_supabaseUrl}/rest/v1`, {
        headers: this.headers,
        schema: settings.db.schema,
        fetch: this.fetch
      });
      if (!settings.accessToken) {
        this._listenForAuthEvents();
      }
    }
    /**
     * Supabase Functions allows you to deploy and invoke edge functions.
     */
    get functions() {
      return new FunctionsClient(this.functionsUrl, {
        headers: this.headers,
        customFetch: this.fetch
      });
    }
    /**
     * Supabase Storage allows you to manage user-generated content, such as photos or videos.
     */
    get storage() {
      return new StorageClient(this.storageUrl, this.headers, this.fetch);
    }
    /**
     * Perform a query on a table or a view.
     *
     * @param relation - The table or view name to query
     */
    from(relation) {
      return this.rest.from(relation);
    }
    // NOTE: signatures must be kept in sync with PostgrestClient.schema
    /**
     * Select a schema to query or perform an function (rpc) call.
     *
     * The schema needs to be on the list of exposed schemas inside Supabase.
     *
     * @param schema - The schema to query
     */
    schema(schema) {
      return this.rest.schema(schema);
    }
    // NOTE: signatures must be kept in sync with PostgrestClient.rpc
    /**
     * Perform a function call.
     *
     * @param fn - The function name to call
     * @param args - The arguments to pass to the function call
     * @param options - Named parameters
     * @param options.head - When set to `true`, `data` will not be returned.
     * Useful if you only need the count.
     * @param options.get - When set to `true`, the function will be called with
     * read-only access mode.
     * @param options.count - Count algorithm to use to count rows returned by the
     * function. Only applicable for [set-returning
     * functions](https://www.postgresql.org/docs/current/functions-srf.html).
     *
     * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
     * hood.
     *
     * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
     * statistics under the hood.
     *
     * `"estimated"`: Uses exact count for low numbers and planned count for high
     * numbers.
     */
    rpc(fn, args = {}, options = {}) {
      return this.rest.rpc(fn, args, options);
    }
    /**
     * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
     *
     * @param {string} name - The name of the Realtime channel.
     * @param {Object} opts - The options to pass to the Realtime channel.
     *
     */
    channel(name, opts = { config: {} }) {
      return this.realtime.channel(name, opts);
    }
    /**
     * Returns all Realtime channels.
     */
    getChannels() {
      return this.realtime.getChannels();
    }
    /**
     * Unsubscribes and removes Realtime channel from Realtime client.
     *
     * @param {RealtimeChannel} channel - The name of the Realtime channel.
     *
     */
    removeChannel(channel) {
      return this.realtime.removeChannel(channel);
    }
    /**
     * Unsubscribes and removes all Realtime channels from Realtime client.
     */
    removeAllChannels() {
      return this.realtime.removeAllChannels();
    }
    _getAccessToken() {
      var _a, _b;
      return __awaiter8(this, void 0, void 0, function* () {
        if (this.accessToken) {
          return yield this.accessToken();
        }
        const { data } = yield this.auth.getSession();
        return (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : null;
      });
    }
    _initSupabaseAuthClient({ autoRefreshToken, persistSession, detectSessionInUrl, storage, storageKey, flowType, lock, debug }, headers, fetch3) {
      const authHeaders = {
        Authorization: `Bearer ${this.supabaseKey}`,
        apikey: `${this.supabaseKey}`
      };
      return new SupabaseAuthClient({
        url: this.authUrl,
        headers: Object.assign(Object.assign({}, authHeaders), headers),
        storageKey,
        autoRefreshToken,
        persistSession,
        detectSessionInUrl,
        storage,
        flowType,
        lock,
        debug,
        fetch: fetch3,
        // auth checks if there is a custom authorizaiton header using this flag
        // so it knows whether to return an error when getUser is called with no session
        hasCustomAuthorizationHeader: "Authorization" in this.headers
      });
    }
    _initRealtimeClient(options) {
      return new RealtimeClient(this.realtimeUrl, Object.assign(Object.assign({}, options), { params: Object.assign({ apikey: this.supabaseKey }, options === null || options === void 0 ? void 0 : options.params) }));
    }
    _listenForAuthEvents() {
      let data = this.auth.onAuthStateChange((event, session) => {
        this._handleTokenChanged(event, "CLIENT", session === null || session === void 0 ? void 0 : session.access_token);
      });
      return data;
    }
    _handleTokenChanged(event, source, token) {
      if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
        this.changedAccessToken = token;
      } else if (event === "SIGNED_OUT") {
        this.realtime.setAuth();
        if (source == "STORAGE")
          this.auth.signOut();
        this.changedAccessToken = void 0;
      }
    }
  };

  // node_modules/@supabase/supabase-js/dist/module/index.js
  var createClient = (supabaseUrl, supabaseKey, options) => {
    return new SupabaseClient(supabaseUrl, supabaseKey, options);
  };

  // services/supabaseService.ts
  var import_meta = {};
  var SUPABASE_URL = import_meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  var SUPABASE_ANON_KEY = import_meta.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  var isConfigured = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 5;
  var supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  var auth = {
    async signUp(email, pass) {
      const client = supabase;
      if (!client) return { error: new Error("Cloud Uplink Not Configured") };
      return await client.auth.signUp({ email, password: pass });
    },
    async signIn(email, pass) {
      const client = supabase;
      if (!client) return { error: new Error("Cloud Uplink Not Configured") };
      return await client.auth.signInWithPassword({ email, password: pass });
    },
    async signOut() {
      const client = supabase;
      if (!client) return;
      return await client.auth.signOut();
    },
    async getSession() {
      const client = supabase;
      if (!client) return null;
      try {
        const { data, error } = await client.auth.getSession();
        if (error) {
          console.warn("Session fetch error:", error.message);
          if (error.message.toLowerCase().includes("refresh token")) {
            await client.auth.signOut().catch(() => {
            });
            if (typeof window !== "undefined") {
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
                    localStorage.removeItem(key);
                  }
                }
              } catch (e) {
              }
            }
          }
          return null;
        }
        return data?.session || null;
      } catch (e) {
        console.warn("getSession exception:", e);
        return null;
      }
    },
    onAuthStateChange(callback) {
      const client = supabase;
      if (!client) return () => {
      };
      const {
        data: { subscription }
      } = client.auth.onAuthStateChange((_event, session) => {
        callback(session);
      });
      return () => subscription.unsubscribe();
    }
  };
  var db = {
    async fetchAll() {
      const client = supabase;
      if (!client) return null;
      try {
        const session = await auth.getSession();
        if (!session) return null;
        const [fRes, sRes, shRes, pRes, lRes, iRes] = await Promise.all([
          client.from("flights").select("*").eq("user_id", session.user.id),
          client.from("staff").select("*").eq("user_id", session.user.id),
          client.from("shifts").select("*").eq("user_id", session.user.id),
          client.from("programs").select("*").eq("user_id", session.user.id),
          client.from("leave_requests").select("*").eq("user_id", session.user.id),
          client.from("incoming_duties").select("*").eq("user_id", session.user.id)
        ]);
        return {
          flights: (fRes.data || []).map((f) => ({
            id: f.id,
            flightNumber: f.flight_number,
            from: f.origin,
            to: f.destination,
            sta: f.sta,
            std: f.std,
            date: f.flight_date,
            type: f.flight_type || "Turnaround",
            day: f.day || 0,
            priority: "Standard"
          })),
          staff: (sRes.data || []).map((s) => {
            let workPattern = s.work_pattern;
            let rosterPeriods = void 0;
            if (workPattern && workPattern.includes("|")) {
              const parts = workPattern.split("|");
              workPattern = parts[0];
              try {
                rosterPeriods = JSON.parse(parts[1]);
              } catch (e) {
              }
            }
            return {
              id: s.id,
              name: s.name,
              initials: s.initials,
              type: s.type,
              workPattern,
              isRamp: !!s.is_ramp,
              isShiftLeader: !!s.is_shift_leader,
              isOps: !!s.is_operations,
              isLoadControl: !!s.is_load_control,
              isLostFound: !!s.is_lost_found,
              isLabour: !!s.is_labour,
              isSecurity: !!s.is_security,
              isDriver: !!s.is_driver,
              isAccountant: !!s.is_accountant,
              powerRate: s.power_rate || 75,
              maxShiftsPerWeek: s.max_shifts_per_week || 5,
              workFromDate: s.work_from_date,
              workToDate: s.work_to_date,
              rosterPeriods,
              isActive: s.is_active !== false
            };
          }),
          shifts: (shRes.data || []).map((s) => ({
            id: s.id,
            day: s.day || 0,
            pickupDate: s.pickup_date,
            pickupTime: s.pickup_time,
            endDate: s.end_date,
            endTime: s.end_time,
            minStaff: s.min_staff || 1,
            maxStaff: s.max_staff || 10,
            roleCounts: s.role_counts || {},
            flightIds: s.flight_ids || []
          })),
          programs: (pRes.data || []).map((p) => {
            const rawOffDuty = p.off_duty || [];
            const notesHacks = rawOffDuty.filter((od) => od.staffId === "NOTES_HACK");
            const actualOffDuty = rawOffDuty.filter((od) => od.staffId !== "NOTES_HACK");
            let notes = p.notes || {};
            if (notesHacks.length > 0) {
              notes = notesHacks[0].data || notes;
            }
            return {
              day: p.day,
              dateString: p.date_string,
              assignments: p.assignments || [],
              offDuty: actualOffDuty,
              notes
            };
          }),
          leaveRequests: (lRes.data || []).map((l) => ({
            id: l.id,
            staffId: l.staff_id,
            startDate: l.start_date,
            endDate: l.end_date,
            type: l.leave_type
          })),
          incomingDuties: (iRes.data || []).map((i) => ({
            id: i.id,
            staffId: i.staff_id,
            date: i.date,
            shiftEndTime: i.shift_end_time
          }))
        };
      } catch (e) {
        console.error("Database fetch failure:", e);
        return null;
      }
    },
    async upsertFlight(f) {
      const client = supabase;
      if (!client) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("flights").upsert({
        id: f.id,
        user_id: session.user.id,
        flight_number: f.flightNumber,
        origin: f.from,
        destination: f.to,
        sta: f.sta || null,
        std: f.std || null,
        flight_date: f.date,
        flight_type: f.type,
        day: f.day
      });
    },
    async upsertStaff(s) {
      const client = supabase;
      if (!client) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("staff").upsert({
        id: s.id,
        user_id: session.user.id,
        name: s.name,
        initials: s.initials,
        type: s.type,
        work_pattern: s.type === "Roster" && s.rosterPeriods ? `${s.workPattern}|${JSON.stringify(s.rosterPeriods)}` : s.workPattern,
        is_ramp: s.isRamp,
        is_shift_leader: s.isShiftLeader,
        is_operations: s.isOps,
        is_load_control: s.isLoadControl,
        is_lost_found: s.isLostFound,
        is_labour: s.isLabour,
        is_security: s.isSecurity,
        is_driver: s.isDriver,
        is_accountant: s.isAccountant,
        power_rate: s.powerRate,
        max_shifts_per_week: s.maxShiftsPerWeek,
        work_from_date: s.workFromDate || null,
        work_to_date: s.workToDate || null,
        is_active: s.isActive !== false
      });
    },
    async upsertShift(s) {
      const client = supabase;
      if (!client) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("shifts").upsert({
        id: s.id,
        user_id: session.user.id,
        day: s.day,
        pickup_date: s.pickupDate,
        pickup_time: s.pickupTime,
        end_date: s.endDate,
        end_time: s.endTime,
        min_staff: s.minStaff || 1,
        max_staff: s.maxStaff || 10,
        role_counts: s.roleCounts || {},
        flight_ids: s.flightIds || []
      });
    },
    async upsertLeave(l) {
      const client = supabase;
      if (!client) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("leave_requests").upsert({
        id: l.id,
        user_id: session.user.id,
        staff_id: l.staffId,
        start_date: l.startDate,
        end_date: l.endDate,
        leave_type: l.type
      });
    },
    async upsertLeaves(leaves) {
      const client = supabase;
      if (!client || leaves.length === 0) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("leave_requests").upsert(
        leaves.map((l) => ({
          id: l.id,
          user_id: session.user.id,
          staff_id: l.staffId,
          start_date: l.startDate,
          end_date: l.endDate,
          leave_type: l.type
        }))
      );
    },
    async upsertIncomingDuty(d) {
      const client = supabase;
      if (!client) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("incoming_duties").upsert({
        id: d.id,
        user_id: session.user.id,
        staff_id: d.staffId,
        date: d.date,
        shift_end_time: d.shiftEndTime
      });
    },
    async upsertIncomingDuties(duties) {
      const client = supabase;
      if (!client || duties.length === 0) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("incoming_duties").upsert(
        duties.map((d) => ({
          id: d.id,
          user_id: session.user.id,
          staff_id: d.staffId,
          date: d.date,
          shift_end_time: d.shiftEndTime
        }))
      );
    },
    async savePrograms(programs) {
      const client = supabase;
      if (!client || programs.length === 0) return;
      const session = await auth.getSession();
      if (!session) return;
      const datesToOverwrite = programs.map((p) => p.dateString).filter(Boolean);
      if (datesToOverwrite.length > 0) {
        await client.from("programs").delete().eq("user_id", session.user.id).in("date_string", datesToOverwrite);
      }
      await client.from("programs").insert(
        programs.map((p) => {
          const offDutyToSave = [
            ...p.offDuty || [],
            { staffId: "NOTES_HACK", type: "NIL", data: p.notes || {} }
          ];
          return {
            user_id: session.user.id,
            day: p.day,
            date_string: p.dateString || "",
            assignments: p.assignments || [],
            off_duty: offDutyToSave
          };
        })
      );
    },
    async deleteFlight(id) {
      const client = supabase;
      const session = await auth.getSession();
      if (client && session)
        await client.from("flights").delete().eq("id", id).eq("user_id", session.user.id);
    },
    async deleteStaff(id) {
      const client = supabase;
      const session = await auth.getSession();
      if (client && session)
        await client.from("staff").delete().eq("id", id).eq("user_id", session.user.id);
    },
    async deleteShift(id) {
      const client = supabase;
      const session = await auth.getSession();
      if (client && session)
        await client.from("shifts").delete().eq("id", id).eq("user_id", session.user.id);
    },
    async deleteLeave(id) {
      const client = supabase;
      const session = await auth.getSession();
      if (client && session)
        await client.from("leave_requests").delete().eq("id", id).eq("user_id", session.user.id);
    },
    async deleteIncomingDuty(id) {
      const client = supabase;
      const session = await auth.getSession();
      if (client && session)
        await client.from("incoming_duties").delete().eq("id", id).eq("user_id", session.user.id);
    },
    async saveProgramVersion(v) {
      const client = supabase;
      if (!client) return;
      const session = await auth.getSession();
      if (!session) return;
      await client.from("program_versions").upsert({
        id: v.id,
        user_id: session.user.id,
        version_number: v.versionNumber,
        name: v.name,
        created_at: v.createdAt,
        period_start: v.periodStart,
        period_end: v.periodEnd,
        programs: v.programs,
        station_health: v.stationHealth,
        is_auto_save: v.isAutoSave || false
      });
    },
    async getProgramVersions() {
      const client = supabase;
      if (!client) return [];
      const session = await auth.getSession();
      if (!session) return [];
      const { data } = await client.from("program_versions").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
      if (!data) return [];
      return data.map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        name: v.name,
        createdAt: v.created_at,
        periodStart: v.period_start,
        periodEnd: v.period_end,
        programs: v.programs,
        stationHealth: v.station_health,
        isAutoSave: v.is_auto_save
      }));
    },
    async deleteProgramVersion(id) {
      const client = supabase;
      const session = await auth.getSession();
      if (client && session)
        await client.from("program_versions").delete().eq("id", id).eq("user_id", session.user.id);
    },
    async getUserProfile() {
      const session = await auth.getSession();
      if (!session) return null;
      const localProfiles = JSON.parse(
        localStorage.getItem("skyops_user_profiles") || "[]"
      );
      let profile = localProfiles.find(
        (p) => p.id === session.user.id
      );
      if (supabase) {
        try {
          const { data } = await supabase.from("user_profiles").select("*").eq("id", session.user.id).single();
          if (data) {
            profile = {
              id: data.id,
              email: data.email,
              role: data.role || "planner",
              aiDailyLimit: data.ai_daily_limit ?? 5,
              aiWeeklyLimit: data.ai_weekly_limit ?? 20,
              aiMonthlyLimit: data.ai_monthly_limit ?? 50,
              maxStaff: data.max_staff ?? 50,
              maxShifts: data.max_shifts ?? 20,
              isActive: data.is_active ?? true,
              companyLogo: data.company_logo ?? "",
              skyopsLogo: data.skyops_logo ?? "",
              preparedBy: data.prepared_by ?? "",
              revisedBy: data.revised_by ?? ""
            };
          } else {
            const { data: emailData } = await supabase.from("user_profiles").select("*").eq("email", session.user.email).single();
            if (emailData) {
              await supabase.from("user_profiles").delete().eq("id", emailData.id);
              await supabase.from("user_profiles").insert({
                ...emailData,
                id: session.user.id
                // Insert with real ID
              });
              profile = {
                id: session.user.id,
                email: emailData.email,
                role: emailData.role || "planner",
                aiDailyLimit: emailData.ai_daily_limit ?? 5,
                aiWeeklyLimit: emailData.ai_weekly_limit ?? 20,
                aiMonthlyLimit: emailData.ai_monthly_limit ?? 50,
                maxStaff: emailData.max_staff ?? 50,
                maxShifts: emailData.max_shifts ?? 20,
                isActive: emailData.is_active ?? true,
                companyLogo: emailData.company_logo ?? "",
                skyopsLogo: emailData.skyops_logo ?? "",
                preparedBy: emailData.prepared_by ?? "",
                revisedBy: emailData.revised_by ?? ""
              };
            }
          }
        } catch (e) {
          console.warn("Could not fetch profile from DB, using local");
        }
      }
      if (!profile) {
        const isFirstUser = localProfiles.length === 0;
        profile = {
          id: session.user.id,
          email: session.user.email,
          role: isFirstUser ? "master" : "planner",
          aiDailyLimit: 5,
          aiWeeklyLimit: 20,
          aiMonthlyLimit: 50,
          maxStaff: 50,
          maxShifts: 20,
          isActive: true,
          companyLogo: "",
          skyopsLogo: "",
          preparedBy: "Operation Control Center",
          revisedBy: ""
        };
        localProfiles.push(profile);
        try {
          localStorage.setItem(
            "skyops_user_profiles",
            JSON.stringify(localProfiles)
          );
        } catch (e) {
        }
        if (supabase) {
          try {
            const { error } = await supabase.from("user_profiles").insert({
              id: profile.id,
              email: profile.email,
              role: profile.role,
              ai_daily_limit: profile.aiDailyLimit,
              ai_weekly_limit: profile.aiWeeklyLimit,
              ai_monthly_limit: profile.aiMonthlyLimit,
              max_staff: profile.maxStaff,
              max_shifts: profile.maxShifts,
              is_active: profile.isActive,
              company_logo: profile.companyLogo,
              skyops_logo: profile.skyopsLogo,
              prepared_by: profile.preparedBy,
              revised_by: profile.revisedBy
            });
            if (error) console.error("Could not insert profile to DB:", error);
          } catch (e) {
            console.warn("Could not insert profile to DB", e);
          }
        }
      }
      return profile;
    },
    async getAllUserProfiles() {
      const localProfiles = JSON.parse(
        localStorage.getItem("skyops_user_profiles") || "[]"
      );
      if (supabase) {
        try {
          const { data, error } = await supabase.from("user_profiles").select("*");
          if (error) {
            console.error("Supabase select error:", error);
          }
          if (data) {
            const dbProfiles = data.map((d) => ({
              id: d.id,
              email: d.email,
              role: d.role,
              aiDailyLimit: d.ai_daily_limit,
              aiWeeklyLimit: d.ai_weekly_limit,
              aiMonthlyLimit: d.ai_monthly_limit,
              maxStaff: d.max_staff,
              maxShifts: d.max_shifts,
              isActive: d.is_active,
              companyLogo: d.company_logo ?? "",
              skyopsLogo: d.skyops_logo ?? "",
              preparedBy: d.prepared_by ?? "",
              revisedBy: d.revised_by ?? ""
            }));
            const missingInDb = localProfiles.filter(
              (lp) => !dbProfiles.some((dp) => dp.email === lp.email)
            );
            return [...dbProfiles, ...missingInDb];
          }
        } catch (e) {
          console.warn("Could not fetch profiles from DB", e);
        }
      }
      return localProfiles;
    },
    async updateUserProfile(profile) {
      const localProfiles = JSON.parse(
        localStorage.getItem("skyops_user_profiles") || "[]"
      );
      const index2 = localProfiles.findIndex(
        (p) => p.id === profile.id
      );
      if (index2 >= 0) {
        localProfiles[index2] = profile;
      } else {
        localProfiles.push(profile);
      }
      try {
        localStorage.setItem("skyops_user_profiles", JSON.stringify(localProfiles));
      } catch (e) {
        console.warn("Could not save to localStorage (quota exceeded?), still trying DB...");
      }
      if (supabase) {
        try {
          const { error } = await supabase.from("user_profiles").upsert({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            ai_daily_limit: profile.aiDailyLimit,
            ai_weekly_limit: profile.aiWeeklyLimit,
            ai_monthly_limit: profile.aiMonthlyLimit,
            max_staff: profile.maxStaff,
            max_shifts: profile.maxShifts,
            is_active: profile.isActive,
            company_logo: profile.companyLogo,
            skyops_logo: profile.skyopsLogo,
            prepared_by: profile.preparedBy,
            revised_by: profile.revisedBy
          });
          if (error) console.error("Could not update profile in DB:", error);
        } catch (e) {
          console.warn("Could not update profile in DB", e);
        }
      }
    },
    async deleteUserProfile(id) {
      const localProfiles = JSON.parse(
        localStorage.getItem("skyops_user_profiles") || "[]"
      );
      const updated = localProfiles.filter((p) => p.id !== id);
      localStorage.setItem("skyops_user_profiles", JSON.stringify(updated));
      if (supabase) {
        try {
          await supabase.from("user_profiles").delete().eq("id", id);
        } catch (e) {
          console.warn("Could not delete profile from DB");
        }
      }
    },
    async createUserProfile(profile) {
      const localProfiles = JSON.parse(
        localStorage.getItem("skyops_user_profiles") || "[]"
      );
      localProfiles.push(profile);
      localStorage.setItem("skyops_user_profiles", JSON.stringify(localProfiles));
      if (supabase) {
        try {
          const { error } = await supabase.from("user_profiles").insert({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            ai_daily_limit: profile.aiDailyLimit,
            ai_weekly_limit: profile.aiWeeklyLimit,
            ai_monthly_limit: profile.aiMonthlyLimit,
            max_staff: profile.maxStaff,
            max_shifts: profile.maxShifts,
            is_active: profile.isActive,
            company_logo: profile.companyLogo,
            skyops_logo: profile.skyopsLogo,
            prepared_by: profile.preparedBy,
            revised_by: profile.revisedBy
          });
          if (error) console.error("Supabase insert error:", error);
        } catch (e) {
          console.warn("Could not insert profile to DB", e);
        }
      }
    },
    async logAction(actionType, entityType, entityId, details) {
      const session = await auth.getSession();
      if (!session) return;
      const log = {
        id: Math.random().toString(36).substr(2, 9),
        userId: session.user.id,
        userEmail: session.user.email,
        actionType,
        entityType,
        entityId,
        details,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const localLogs = JSON.parse(
        localStorage.getItem("skyops_audit_logs") || "[]"
      );
      localLogs.unshift(log);
      localStorage.setItem(
        "skyops_audit_logs",
        JSON.stringify(localLogs.slice(0, 1e3))
      );
      if (supabase) {
        try {
          await supabase.from("audit_logs").insert({
            id: log.id,
            user_id: log.userId,
            user_email: log.userEmail,
            action_type: log.actionType,
            entity_type: log.entityType,
            entity_id: log.entityId,
            details: log.details,
            created_at: log.createdAt
          });
        } catch (e) {
          console.warn("Could not insert audit log to DB");
        }
      }
    },
    async getAuditLogs() {
      if (supabase) {
        try {
          const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
          if (data && data.length > 0) {
            return data.map((d) => ({
              id: d.id,
              userId: d.user_id,
              userEmail: d.user_email,
              actionType: d.action_type,
              entityType: d.entity_type,
              entityId: d.entity_id,
              details: d.details,
              createdAt: d.created_at
            }));
          }
        } catch (e) {
          console.warn("Could not fetch audit logs from DB");
        }
      }
      return JSON.parse(localStorage.getItem("skyops_audit_logs") || "[]");
    },
    async getAIGenerationCount(userId, period) {
      const logs = await this.getAuditLogs();
      const now = /* @__PURE__ */ new Date();
      let startDate = /* @__PURE__ */ new Date();
      if (period === "daily") {
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "weekly") {
        const day = startDate.getDay();
        const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
        startDate.setDate(diff);
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "monthly") {
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
      }
      return logs.filter(
        (l) => l.userId === userId && l.actionType === "GENERATE_AI" && new Date(l.createdAt) >= startDate
      ).length;
    }
  };

  // components/ProgramDisplay.tsx
  var import_jsx_runtime = __require("react/jsx-runtime");
  var ProgramDisplay = ({
    programs,
    flights,
    staff,
    shifts,
    leaveRequests,
    incomingDuties,
    manualAssignments = [],
    startDate,
    endDate,
    stationHealth,
    minRestHours,
    onUpdatePrograms,
    onRestoreVersion,
    onUpdateLeaves
  }) => {
    const [isGeneratingPdf, setIsGeneratingPdf] = (0, import_react.useState)(false);
    const [isGeneratingStaffPdf, setIsGeneratingStaffPdf] = (0, import_react.useState)(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = (0, import_react.useState)(false);
    const [versions, setVersions] = (0, import_react.useState)([]);
    const [showHistory, setShowHistory] = (0, import_react.useState)(false);
    const [activeTab, setActiveTab] = (0, import_react.useState)("Daily");
    const [unlockAbsences, setUnlockAbsences] = (0, import_react.useState)(false);
    const [noteModal, setNoteModal] = (0, import_react.useState)(null);
    const [referencePrograms, setReferencePrograms] = (0, import_react.useState)(
      () => {
        try {
          const stored = localStorage.getItem("skyops_reference_programs");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
        } catch {
        }
        return programs;
      }
    );
    (0, import_react.useEffect)(() => {
      if (referencePrograms.length === 0 && programs.length > 0) {
        setReferencePrograms(programs);
        localStorage.setItem(
          "skyops_reference_programs",
          JSON.stringify(programs)
        );
      }
    }, [programs, referencePrograms]);
    const handleMarkAllCopied = () => {
      setReferencePrograms(programs);
      localStorage.setItem("skyops_reference_programs", JSON.stringify(programs));
    };
    (0, import_react.useEffect)(() => {
      const loadVersions = async () => {
        if (supabase) {
          const dbVersions = await db.getProgramVersions();
          if (dbVersions.length > 0) {
            setVersions(dbVersions);
            return;
          }
        }
        const saved = localStorage.getItem("skyops_program_versions");
        if (saved) {
          try {
            setVersions(JSON.parse(saved));
          } catch (e) {
            console.error("Failed to load versions", e);
          }
        }
      };
      loadVersions();
    }, []);
    const saveVersion = async () => {
      const name = prompt(
        "Enter a name for this version (e.g., 'Draft 1', 'Final Approval'):",
        `Version ${versions.length + 1}`
      );
      if (!name) return;
      const newVersion = {
        id: Math.random().toString(36).substr(2, 9),
        versionNumber: versions.length + 1,
        name,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        periodStart: startDate,
        periodEnd: endDate,
        programs: JSON.parse(JSON.stringify(programs)),
        stationHealth,
        isAutoSave: false
      };
      const updatedVersions = [newVersion, ...versions];
      setVersions(updatedVersions);
      localStorage.setItem(
        "skyops_program_versions",
        JSON.stringify(updatedVersions)
      );
      if (supabase) {
        await db.saveProgramVersion(newVersion);
      }
    };
    const deleteVersion = async (id) => {
      if (!confirm("Are you sure you want to delete this version?")) return;
      const updated = versions.filter((v) => v.id !== id);
      setVersions(updated);
      localStorage.setItem("skyops_program_versions", JSON.stringify(updated));
      if (supabase) {
        await db.deleteProgramVersion(id);
      }
    };
    const restoreVersion = (v) => {
      if (!confirm(
        `Restore version "${v.name}"? Current unsaved changes will be lost.`
      ))
        return;
      onRestoreVersion(v);
      setShowHistory(false);
    };
    const activeStaff = import_react.default.useMemo(() => staff.filter((s) => s.isActive !== false), [staff]);
    const getStaff = (id) => activeStaff.find((s) => s.id === id);
    const getFlight = (id) => flights.find((f) => f.id === id);
    const getShift = (id) => shifts.find((s) => s.id === id);
    const sortAssignments = (assignments) => {
      return [...assignments].sort((a, b) => {
        const stA = getStaff(a.staffId);
        const stB = getStaff(b.staffId);
        if (!stA && !stB) return 0;
        if (!stA) return 1;
        if (!stB) return -1;
        const getGroupRank = (st) => {
          if (st.isLabour) return 3;
          if (st.isSecurity) return 2;
          return 1;
        };
        const rankA = getGroupRank(stA);
        const rankB = getGroupRank(stB);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        if (rankA === 1) {
          const getTrafficSubRank = (assig, st) => {
            if (assig.role === "SL" || assig.role === "Shift Leader" || st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")
              return 1;
            if (assig.role === "LC" || assig.role === "Load Control" || st.isLoadControl)
              return 2;
            return 3;
          };
          const subRankA = getTrafficSubRank(a, stA);
          const subRankB = getTrafficSubRank(b, stB);
          if (subRankA !== subRankB) {
            return subRankA - subRankB;
          }
        }
        const aSort = a.manualSortIndex || 0;
        const bSort = b.manualSortIndex || 0;
        if (aSort !== bSort) {
          return aSort - bSort;
        }
        return (stA.initials || "").localeCompare(stB.initials || "");
      });
    };
    const sortAssignmentsForPDF = (assignments) => {
      return [...assignments].sort((a, b) => {
        const aSort = a.manualSortIndex || 0;
        const bSort = b.manualSortIndex || 0;
        if (aSort !== bSort) {
          return aSort - bSort;
        }
        const stA = getStaff(a.staffId);
        const stB = getStaff(b.staffId);
        const score = (assig, st) => {
          if (!st) return 100;
          if (assig.role === "SL" || assig.role === "Shift Leader" || st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")
            return 1;
          if (assig.role === "LC" || assig.role === "Load Control" || st.isLoadControl)
            return 2;
          if (st.isLabour) return 10;
          return 5;
        };
        return score(a, stA) - score(b, stB);
      });
    };
    const getShiftHours = (shiftId) => {
      const shift = getShift(shiftId);
      if (!shift) return 0;
      const [ph, pm] = shift.pickupTime.split(":").map(Number);
      const [sh, sm] = shift.endTime.split(":").map(Number);
      let hours = sh - ph + (sm - pm) / 60;
      if (sh < ph) hours += 24;
      return hours;
    };
    const getStaffTotalHours = (staffId) => {
      return activePrograms.reduce((acc, p) => {
        const assign = p.assignments.find((a) => a.staffId === staffId);
        if (assign) {
          return acc + getShiftHours(assign.shiftId || "");
        }
        return acc;
      }, 0);
    };
    const activePrograms = import_react.default.useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      programs.forEach((p) => {
        if (p.dateString && p.dateString >= startDate && p.dateString <= endDate) {
          map.set(p.dateString, p);
        }
      });
      return Array.from(map.values()).sort(
        (a, b) => (a.dateString || "").localeCompare(b.dateString || "")
      );
    }, [programs, startDate, endDate]);
    const sortFlightsByTime = (flightIds, shiftPickupTime) => {
      return flightIds.map((fid) => getFlight(fid)).filter(Boolean).sort((a, b) => {
        const getFlightTime = (f) => {
          if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
            return f.sta;
          }
          if (f?.std && f.std.trim() !== "" && f.std !== "---") {
            return f.std;
          }
          return "";
        };
        const getMinutes = (fTime) => {
          if (!fTime || fTime.toUpperCase().includes("NS") || fTime.includes("---")) return 9999;
          const parts = fTime.split(":");
          const fh = parseInt(parts[0]) || 0;
          const fm = parseInt(parts[1]) || 0;
          const ph = parseInt(shiftPickupTime.split(":")[0]) || 0;
          let totalMins = fh * 60 + fm;
          if (ph >= 12 && fh < 12) {
            totalMins += 24 * 60;
          }
          return totalMins;
        };
        return getMinutes(getFlightTime(a)) - getMinutes(getFlightTime(b));
      }).map((f) => f.flightNumber).join(" / ") || "NIL";
    };
    const leaveMapByStaff = import_react.default.useMemo(() => {
      const map = {};
      leaveRequests.forEach((l) => {
        if (!map[l.staffId]) map[l.staffId] = [];
        map[l.staffId].push(l);
      });
      return map;
    }, [leaveRequests]);
    const hasLeaveOnDate = import_react.default.useCallback(
      (staffId, dateString, excludeDayOff = false) => {
        const leaves = leaveMapByStaff[staffId];
        if (!leaves) return null;
        return leaves.find((l) => {
          if (excludeDayOff && l.type === "Day off") return false;
          return l.startDate <= dateString && l.endDate >= dateString;
        });
      },
      [leaveMapByStaff]
    );
    const totalAssignments = activePrograms.reduce(
      (acc, p) => acc + p.assignments.length,
      0
    );
    const isFailedGeneration = activePrograms.length > 0 && totalAssignments === 0;
    const incomingDutiesByStaff = import_react.default.useMemo(() => {
      const map = {};
      incomingDuties.forEach((d) => {
        if (!map[d.staffId]) map[d.staffId] = [];
        map[d.staffId].push(d);
      });
      return map;
    }, [incomingDuties]);
    const assignmentsByStaff = import_react.default.useMemo(() => {
      const map = {};
      programs.forEach((p) => {
        const pDate = p.dateString || startDate;
        p.assignments.forEach((a) => {
          if (!map[a.staffId]) map[a.staffId] = [];
          map[a.staffId].push({ shiftId: a.shiftId || "", dateString: pDate });
        });
      });
      return map;
    }, [programs, startDate]);
    const calculateRestHours = (staffId, currentShiftStart) => {
      let lastEndTime = null;
      const staffIncoming = incomingDutiesByStaff[staffId] || [];
      staffIncoming.forEach((d) => {
        let dateStr = d.date;
        if (!dateStr) {
          const pd = new Date(startDate);
          pd.setDate(pd.getDate() - 1);
          dateStr = pd.toISOString().split("T")[0];
        }
        const dt = /* @__PURE__ */ new Date(`${dateStr}T${d.shiftEndTime}`);
        if (dt <= currentShiftStart && (!lastEndTime || dt > lastEndTime)) {
          lastEndTime = dt;
        }
      });
      const assigns = assignmentsByStaff[staffId] || [];
      assigns.forEach((a) => {
        const s = getShift(a.shiftId);
        if (s) {
          const [sh, sm] = s.endTime.split(":").map(Number);
          const [ph, pm] = s.pickupTime.split(":").map(Number);
          const startDt = new Date(a.dateString);
          startDt.setHours(ph, pm, 0, 0);
          const endDt = new Date(a.dateString);
          endDt.setHours(sh, sm, 0, 0);
          if (sh < ph) endDt.setDate(endDt.getDate() + 1);
          if (startDt < currentShiftStart && (!lastEndTime || endDt > lastEndTime)) {
            lastEndTime = endDt;
          }
        }
      });
      if (!lastEndTime) return null;
      const diffMs = currentShiftStart.getTime() - lastEndTime.getTime();
      return parseFloat((diffMs / (1e3 * 60 * 60)).toFixed(1));
    };
    const generateFullReport = async () => {
      setIsGeneratingPdf(true);
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF("l", "mm", "a4");
      activePrograms.forEach((prog, index2) => {
        if (index2 > 0) doc.addPage();
        const currentDate = new Date(prog.dateString || startDate);
        const dateStr = `${DAYS_OF_WEEK_FULL[currentDate.getUTCDay()].toUpperCase()} - ${currentDate.getUTCDate()}/${currentDate.getUTCMonth() + 1}/${currentDate.getUTCFullYear()}`;
        doc.setFillColor(255, 255, 255);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("SkyOPS Station Handling Program", 14, 15);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 22);
        let contentStartY = 35;
        if (index2 === 0) {
          const groupedMap = /* @__PURE__ */ new Map();
          incomingDuties.forEach((d) => {
            const dateStr2 = d.date || startDate;
            const dDate = new Date(dateStr2);
            const sDate = new Date(startDate);
            const diffTime = sDate.getTime() - dDate.getTime();
            const diffDays = diffTime / (1e3 * 3600 * 24);
            if (diffDays >= 0 && diffDays <= 2) {
              const key = `${dateStr2}|${d.shiftEndTime}`;
              const st = getStaff(d.staffId);
              if (st) {
                const existing = groupedMap.get(key) || [];
                existing.push(st.initials);
                groupedMap.set(key, existing);
              }
            }
          });
          const sortedKeys = Array.from(groupedMap.keys()).sort();
          if (sortedKeys.length > 0) {
            const restRows = sortedKeys.map((key, i) => {
              const [dDate, dTime] = key.split("|");
              const endDt = /* @__PURE__ */ new Date(`${dDate}T${dTime}`);
              const releaseDt = new Date(
                endDt.getTime() + minRestHours * 60 * 60 * 1e3
              );
              const isPrevDay = new Date(dDate) < new Date(startDate);
              const dateLabel = isPrevDay ? "Prev Day" : `${endDt.getDate()}/${endDt.getMonth() + 1}`;
              const releaseDateLabel = releaseDt.getDate() !== endDt.getDate() ? releaseDt.getDate() === new Date(startDate).getDate() ? "" : `${releaseDt.getDate()}/${releaseDt.getMonth() + 1}` : "";
              const initials = groupedMap.get(key)?.join("-") || "";
              const hc = groupedMap.get(key)?.length || 0;
              return [
                (i + 1).toString(),
                `${dTime} (${dateLabel})`,
                `${releaseDt.getHours().toString().padStart(2, "0")}:${releaseDt.getMinutes().toString().padStart(2, "0")} ${releaseDateLabel}`,
                hc.toString(),
                initials
              ];
            });
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(
              "PREVIOUS DAY SHIFTS (INCOMING HANDOVER)",
              14,
              contentStartY - 2
            );
            autoTable(doc, {
              startY: contentStartY,
              head: [
                ["S/N", "SHIFT END", "RELEASE", "HC", "PERSONNEL (REST LOG)"]
              ],
              body: restRows,
              theme: "grid",
              headStyles: {
                fillColor: [255, 204, 0],
                textColor: [0, 0, 0],
                fontStyle: "bold",
                fontSize: 8,
                lineWidth: 0.1,
                lineColor: [0, 0, 0]
              },
              styles: {
                fontSize: 8,
                cellPadding: 1.5,
                textColor: [0, 0, 0],
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                fillColor: [255, 255, 235],
                valign: "middle"
              },
              columnStyles: {
                0: { cellWidth: 10, halign: "center" },
                1: { cellWidth: 35 },
                2: { cellWidth: 35 },
                3: { cellWidth: 15, halign: "center", fontStyle: "bold" },
                4: { cellWidth: "auto" }
              },
              margin: { left: 14, right: 14 }
            });
            contentStartY = doc.lastAutoTable.finalY + 10;
          }
        }
        const workingIds = new Set(prog.assignments.map((a) => a.staffId));
        const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
        const pdfCategories = {
          "DAYS OFF": [],
          "ROSTER LEAVE": [],
          "ANNUAL LEAVE": [],
          "SICK LEAVE": [],
          "STANDBY (RESERVE)": []
        };
        offStaff.forEach((s) => {
          const leave = hasLeaveOnDate(s.id, prog.dateString);
          let count = 1;
          if (leave) {
            const start = new Date(leave.startDate);
            const current = new Date(prog.dateString);
            count = Math.floor(
              (current.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)
            ) + 1;
          } else {
            for (let i = index2 - 1; i >= 0; i--) {
              const prevProg = activePrograms[i];
              const worked = prevProg.assignments.some((a) => a.staffId === s.id);
              const prevLeave = hasLeaveOnDate(s.id, prevProg.dateString);
              if (!worked && !prevLeave) count++;
              else break;
            }
          }
          const label = s.initials;
          let isRosterOutOfContract = false;
          if (s.type === "Roster") {
            if (s.rosterPeriods && s.rosterPeriods.length > 0) {
              isRosterOutOfContract = !s.rosterPeriods.some(
                (p) => prog.dateString >= p.start && prog.dateString <= p.end
              );
            } else if (s.workFromDate && s.workToDate) {
              isRosterOutOfContract = prog.dateString < s.workFromDate || prog.dateString > s.workToDate;
            }
          }
          if (leave) {
            if (leave.type === "Annual leave")
              pdfCategories["ANNUAL LEAVE"].push(label);
            else if (leave.type === "Roster leave")
              pdfCategories["ROSTER LEAVE"].push(label);
            else if (leave.type === "Sick leave")
              pdfCategories["SICK LEAVE"].push(label);
            else pdfCategories["DAYS OFF"].push(label);
          } else if (isRosterOutOfContract) {
            pdfCategories["ROSTER LEAVE"].push(label);
          } else {
            if (s.type === "Local") pdfCategories["DAYS OFF"].push(label);
            else pdfCategories["STANDBY (RESERVE)"].push(label);
          }
        });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(dateStr, 14, contentStartY);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(70, 70, 70);
        const statsText = `HEADCOUNT RECONCILIATION: Total Registered: ${staff.length} | Working: ${workingIds.size} | Days Off: ${pdfCategories["DAYS OFF"].length} | Annual Leave: ${pdfCategories["ANNUAL LEAVE"].length} | Sick Leave: ${pdfCategories["SICK LEAVE"].length} | Standby: ${pdfCategories["STANDBY (RESERVE)"].length} | Roster Leave: ${pdfCategories["ROSTER LEAVE"].length}`;
        doc.text(statsText, 14, contentStartY + 5);
        contentStartY += 10;
        const shiftsToday = shifts.filter((s) => s.pickupDate === prog.dateString).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
        const tableData = shiftsToday.map((shift, idx) => {
          const assignments = sortAssignmentsForPDF(prog.assignments.filter(
            (a) => a.shiftId === shift.id
          ));
          const nonLabourCount = assignments.filter((a) => {
            const st = getStaff(a.staffId);
            return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
          }).length;
          const flightStrs = sortFlightsByTime(shift.flightIds || [], shift.pickupTime);
          const personnelStrs = assignments.map((a) => {
            const st = getStaff(a.staffId);
            if (!st) return "";
            return st.initials;
          }).join("-");
          const roleChecks = Object.entries(shift.roleCounts || {}).filter(([_, count]) => count > 0).map(([role, count]) => {
            let roleKey = role;
            if (role === "Load Control") roleKey = "LC";
            if (role === "Shift Leader") roleKey = "SL";
            if (role === "Ramp") roleKey = "RMP";
            if (role === "Operations") roleKey = "OPS";
            if (role === "Lost and Found") roleKey = "LF";
            if (role === "Labour") roleKey = "LBR";
            if (role === "Security") roleKey = "SEC";
            if (role === "Driver") roleKey = "DRV";
            if (role === "Accountant") roleKey = "ACC";
            const fulfilledCount = assignments.filter((a) => {
              const st = getStaff(a.staffId);
              if (!st) return false;
              if (a.role === roleKey || a.role === role) return true;
              if (roleKey === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ"))
                return true;
              if (roleKey === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ"))
                return true;
              if (roleKey === "RMP" && st.isRamp) return true;
              if (roleKey === "OPS" && st.isOps) return true;
              if (roleKey === "LF" && st.isLostFound) return true;
              if ((roleKey === "LBR" || roleKey === "Labour") && st.isLabour)
                return true;
              if ((roleKey === "DRV" || roleKey === "Driver") && st.isDriver)
                return true;
              if ((roleKey === "SEC" || roleKey === "Security") && st.isSecurity)
                return true;
              if ((roleKey === "ACC" || roleKey === "Accountant") && st.isAccountant)
                return true;
              return false;
            }).length;
            const isFulfilled = fulfilledCount >= count;
            return `${roleKey} ${isFulfilled ? "(OK)" : "(X)"}`;
          });
          const reqStr = roleChecks.length > 0 ? `
Req: ${roleChecks.join(" | ")}` : "";
          return [
            (idx + 1).toString(),
            shift.pickupTime,
            shift.endTime,
            flightStrs,
            `${nonLabourCount} / ${shift.maxStaff}`,
            personnelStrs + reqStr
          ];
        });
        autoTable(doc, {
          startY: contentStartY,
          head: [
            [
              "S/N",
              "PICKUP",
              "RELEASE",
              "FLIGHTS",
              "HC / MAX",
              "PERSONNEL & ASSIGNED ROLES"
            ]
          ],
          body: tableData,
          theme: "grid",
          headStyles: {
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            fontStyle: "bold"
          },
          styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
          columnStyles: {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: 20 },
            2: { cellWidth: 20 },
            3: { cellWidth: 25 },
            4: { cellWidth: 20, halign: "center" },
            5: { cellWidth: "auto" }
          }
        });
        const finalY = doc.lastAutoTable.finalY + 10;
        if (finalY > 180) doc.addPage();
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("ABSENCE AND REST REGISTRY", 14, finalY);
        const registryData = [
          ["DAYS OFF", pdfCategories["DAYS OFF"].join("-") || "NIL"],
          ["ROSTER LEAVE", pdfCategories["ROSTER LEAVE"].join("-") || "NIL"],
          ["ANNUAL LEAVE", pdfCategories["ANNUAL LEAVE"].join("-") || "NIL"],
          ["SICK LEAVE", pdfCategories["SICK LEAVE"].join("-") || "NIL"],
          [
            "STANDBY (RESERVE)",
            pdfCategories["STANDBY (RESERVE)"].join("-") || "NIL"
          ]
        ];
        autoTable(doc, {
          startY: finalY + 2,
          head: [["STATUS CATEGORY", "PERSONNEL INITIALS"]],
          body: registryData,
          theme: "grid",
          headStyles: { fillColor: [50, 50, 60], textColor: [255, 255, 255] },
          styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
          columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } }
        });
      });
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Weekly Personnel Utilization Audit (Local)", 14, 15);
      const localStaff = activeStaff.filter((s) => s.type === "Local");
      const localAuditData = localStaff.map((s, idx) => {
        const shiftsWorked = activePrograms.reduce(
          (acc, p) => acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
          0
        );
        let excusedLeaves = 0;
        activePrograms.forEach((p) => {
          const hasLeave = hasLeaveOnDate(s.id, p.dateString, true);
          if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
            excusedLeaves++;
        });
        const daysOff = activePrograms.length - shiftsWorked - excusedLeaves;
        const targetShifts = 5 - excusedLeaves;
        const targetOff = 2;
        const isMatch = shiftsWorked === targetShifts && daysOff === targetOff;
        const leavesText = excusedLeaves > 0 ? excusedLeaves.toString() : "-";
        return [
          (idx + 1).toString(),
          s.name,
          s.initials,
          shiftsWorked.toString(),
          daysOff.toString(),
          leavesText,
          isMatch ? "MATCH" : "CHECK"
        ];
      });
      autoTable(doc, {
        startY: 20,
        head: [
          ["S/N", "NAME", "INIT", "WORK SHIFTS", "OFF DAYS", "LEAVES", "STATUS"]
        ],
        body: localAuditData,
        theme: "striped",
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 9, halign: "center" },
        columnStyles: { 1: { halign: "left" } },
        didParseCell: (data) => {
          if (data.section === "body") {
            const status = data.row.raw[6];
            if (status === "MATCH") {
              data.cell.styles.fillColor = [22, 163, 74];
              data.cell.styles.textColor = [255, 255, 255];
            } else if (status === "CHECK") {
              data.cell.styles.fillColor = [220, 38, 38];
              data.cell.styles.textColor = [255, 255, 255];
            }
          }
        }
      });
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text("Weekly Personnel Utilization Audit (Roster)", 14, 15);
      const rosterStaff = activeStaff.filter((s) => s.type === "Roster");
      const rosterAuditData = rosterStaff.map((s, idx) => {
        const shiftsWorked = activePrograms.reduce(
          (acc, p) => acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
          0
        );
        const progStart = new Date(startDate);
        const progEnd = new Date(endDate);
        const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
        const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
        const overlapStart = workFrom > progStart ? workFrom : progStart;
        const overlapEnd = workTo < progEnd ? workTo : progEnd;
        let potential = 0;
        if (overlapStart <= overlapEnd) {
          potential = Math.floor(
            (overlapEnd.getTime() - overlapStart.getTime()) / (1e3 * 60 * 60 * 24)
          ) + 1;
        }
        let excusedLeaves = 0;
        activePrograms.forEach((p) => {
          const d = new Date(p.dateString);
          if (d >= overlapStart && d <= overlapEnd) {
            const hasLeave = hasLeaveOnDate(s.id, p.dateString, true);
            if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
              excusedLeaves++;
          }
        });
        const isMatch = shiftsWorked === potential - excusedLeaves;
        const leavesText = excusedLeaves > 0 ? excusedLeaves.toString() : "-";
        return [
          (idx + 1).toString(),
          s.name,
          s.initials,
          s.workFromDate || "N/A",
          s.workToDate || "N/A",
          potential.toString(),
          shiftsWorked.toString(),
          leavesText,
          isMatch ? "MATCH" : "CHECK"
        ];
      });
      autoTable(doc, {
        startY: 20,
        head: [
          [
            "S/N",
            "NAME",
            "INIT",
            "WORK FROM",
            "WORK TO",
            "POTENTIAL",
            "ACTUAL",
            "LEAVES",
            "STATUS"
          ]
        ],
        body: rosterAuditData,
        theme: "striped",
        headStyles: { fillColor: [0, 0, 0] },
        styles: { fontSize: 9, halign: "center" },
        columnStyles: { 1: { halign: "left" } },
        didParseCell: (data) => {
          if (data.section === "body") {
            const status = data.row.raw[8];
            if (status === "MATCH") {
              data.cell.styles.fillColor = [22, 163, 74];
              data.cell.styles.textColor = [255, 255, 255];
            } else if (status === "CHECK") {
              data.cell.styles.fillColor = [220, 38, 38];
              data.cell.styles.textColor = [255, 255, 255];
            }
          }
        }
      });
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text("Weekly Operations Matrix View", 14, 15);
      const dateHeaders = activePrograms.map((p) => {
        const d = new Date(p.dateString || startDate);
        return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      });
      const matrixHead = [["S/N", "AGENT", ...dateHeaders, "AUDIT"]];
      const getStaffTypeRankPdf = (s) => {
        if (s.isDriver) return 5;
        if (s.isLabour) return 4;
        if (s.isSecurity) return 3;
        if (s.isAccountant) return 2;
        return 1;
      };
      const sortedMatrixStaffPdf = [...staff].map((s) => ({
        ...s,
        totalHours: getStaffTotalHours(s.id)
      })).sort((a, b) => {
        const rankA = getStaffTypeRankPdf(a);
        const rankB = getStaffTypeRankPdf(b);
        if (rankA !== rankB) return rankA - rankB;
        return a.totalHours - b.totalHours;
      });
      const matrixBody = sortedMatrixStaffPdf.map((s, idx) => {
        const row = [
          (idx + 1).toString(),
          `${s.name} (${s.initials})`
        ];
        let workedCount = 0;
        let excusedLeaves = 0;
        activePrograms.forEach((p) => {
          const hasLeave = hasLeaveOnDate(s.id, p.dateString, true);
          if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
            excusedLeaves++;
          const assign = p.assignments.find((a) => a.staffId === s.id);
          if (assign) {
            workedCount++;
            const shift = getShift(assign.shiftId || "");
            if (shift) {
              const pDate = new Date(p.dateString);
              const [ph, pm] = shift.pickupTime.split(":").map(Number);
              const shiftStart = new Date(pDate);
              shiftStart.setHours(ph, pm, 0, 0);
              const rest = calculateRestHours(s.id, shiftStart);
              const restLabel = rest !== null ? `[${rest.toFixed(1)}H]` : "";
              row.push(`${shift.pickupTime} ${restLabel}`);
            } else {
              row.push("ERR");
            }
          } else {
            row.push("-");
          }
        });
        row.push(
          `${workedCount}/${activePrograms.length} [${s.totalHours.toFixed(1)}H]${excusedLeaves > 0 ? ` (+${excusedLeaves} AL)` : ""}`
        );
        return row;
      });
      autoTable(doc, {
        startY: 20,
        head: matrixHead,
        body: matrixBody,
        theme: "grid",
        headStyles: { fillColor: [220, 100, 0] },
        styles: { fontSize: 7, halign: "center", cellPadding: 1.5 },
        columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index === dateHeaders.length + 2) {
            data.cell.styles.fillColor = [79, 70, 229];
          }
          if (data.section === "body") {
            if (data.column.index === dateHeaders.length + 2) {
              data.cell.styles.fillColor = [238, 242, 255];
              data.cell.styles.textColor = [49, 46, 129];
              data.cell.styles.fontStyle = "bold";
            } else if (data.column.index > 1 && data.column.index < dateHeaders.length + 2) {
              const text = data.cell.raw;
              if (text && text.includes("[")) {
                const match = text.match(/\[([\d.]+)H\]/);
                if (match) {
                  const rest = parseFloat(match[1]);
                  if (rest < minRestHours) {
                    data.cell.styles.fillColor = [220, 38, 38];
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = "bold";
                  }
                }
              }
            }
          }
        }
      });
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text("Specialist Role Fulfillment Matrix", 14, 15);
      const roleMatrixData = [];
      const roleMatrixMeta = [];
      activePrograms.forEach((p) => {
        const d = new Date(p.dateString || startDate);
        const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
        const shiftsToday = shifts.filter((s) => s.pickupDate === p.dateString).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
        shiftsToday.forEach((s) => {
          const assignments = p.assignments.filter((a) => a.shiftId === s.id);
          const coversRole = (a, targetRole) => {
            const st = getStaff(a.staffId);
            if (!st) return false;
            const roleCode = targetRole === "Shift Leader" ? "SL" : targetRole === "Load Control" ? "LC" : targetRole === "Ramp" ? "RMP" : targetRole === "Operations" ? "OPS" : targetRole === "Lost and Found" ? "LF" : targetRole === "Accountant" ? "ACC" : targetRole;
            if (roleCode === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
            if (roleCode === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
            if (roleCode === "RMP" && !st.isRamp) return false;
            if (roleCode === "OPS" && !st.isOps) return false;
            if (roleCode === "LF" && !st.isLostFound) return false;
            if ((roleCode === "Labour" || roleCode === "LBR") && !st.isLabour) return false;
            if ((roleCode === "Driver" || roleCode === "DRV") && !st.isDriver) return false;
            if ((roleCode === "Security" || roleCode === "SEC") && !st.isSecurity) return false;
            if ((roleCode === "Accountant" || roleCode === "ACC") && !st.isAccountant) return false;
            if (a.role === roleCode || a.role === targetRole) return true;
            if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
            if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
            if (roleCode === "RMP" && st.isRamp) return true;
            if (roleCode === "OPS" && st.isOps) return true;
            if (roleCode === "LF" && st.isLostFound) return true;
            if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
            if ((roleCode === "Driver" || roleCode === "DRV") && st.isDriver) return true;
            if ((roleCode === "Security" || roleCode === "SEC") && st.isSecurity) return true;
            if ((roleCode === "Accountant" || roleCode === "ACC") && st.isAccountant) return true;
            return false;
          };
          const getStaffForRole = (role) => {
            return assignments.filter((a) => coversRole(a, role)).map((a) => getStaff(a.staffId)?.initials).filter(Boolean).join(", ");
          };
          const sl = getStaffForRole("Shift Leader");
          const lc = getStaffForRole("Load Control");
          const rmp = getStaffForRole("Ramp");
          const ops = getStaffForRole("Operations");
          const lf = getStaffForRole("Lost and Found");
          const drv = getStaffForRole("Driver");
          const sec = getStaffForRole("Security");
          roleMatrixData.push([
            dateLabel,
            `${s.pickupTime}-${s.endTime}`,
            sl,
            lc,
            rmp,
            ops,
            lf,
            drv,
            sec
          ]);
          roleMatrixMeta.push({
            slReq: (s.roleCounts?.["Shift Leader"] || s.roleCounts?.["SL"] || 0) > 0,
            lcReq: (s.roleCounts?.["Load Control"] || s.roleCounts?.["LC"] || 0) > 0,
            rmpReq: (s.roleCounts?.["Ramp"] || s.roleCounts?.["RMP"] || 0) > 0,
            opsReq: (s.roleCounts?.["Operations"] || s.roleCounts?.["OPS"] || 0) > 0,
            lfReq: (s.roleCounts?.["Lost and Found"] || s.roleCounts?.["LF"] || 0) > 0,
            drvReq: (s.roleCounts?.["Driver"] || s.roleCounts?.["DRV"] || 0) > 0,
            secReq: (s.roleCounts?.["Security"] || s.roleCounts?.["SEC"] || 0) > 0
          });
        });
      });
      autoTable(doc, {
        startY: 20,
        head: [["DATE", "SHIFT", "SL", "LC", "RMP", "OPS", "LF", "DRV", "SEC"]],
        body: roleMatrixData,
        theme: "grid",
        headStyles: { fillColor: [0, 0, 0] },
        styles: {
          fontSize: 7,
          halign: "center",
          valign: "middle",
          cellPadding: 1.5
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index > 1) {
            const rowIndex = data.row.index;
            const meta = roleMatrixMeta[rowIndex];
            if (!meta) return;
            const colIdx = data.column.index;
            let isRequired = false;
            if (colIdx === 2) isRequired = meta.slReq;
            if (colIdx === 3) isRequired = meta.lcReq;
            if (colIdx === 4) isRequired = meta.rmpReq;
            if (colIdx === 5) isRequired = meta.opsReq;
            if (colIdx === 6) isRequired = meta.lfReq;
            const content = data.cell.raw;
            const hasContent = content && content.length > 0;
            if (hasContent) {
              data.cell.styles.fillColor = [22, 163, 74];
              data.cell.styles.textColor = [255, 255, 255];
            } else if (isRequired) {
              data.cell.styles.fillColor = [220, 38, 38];
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.text = ["MISSING"];
            }
          }
        }
      });
      if (manualAssignments && manualAssignments.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Requested Shifts (Pre-Assigned)", 14, 15);
        const requestedShiftsData = manualAssignments.map((ma) => {
          const st = activeStaff.find((s) => s.id === ma.staffId);
          const sh = shifts.find((s) => s.id === ma.shiftId);
          const staffName = st ? `${st.initials} - ${st.name}` : ma.staffId;
          const shiftDetails = sh ? `${sh.pickupDate} ${sh.pickupTime}-${sh.endTime}` : ma.shiftId;
          return [staffName, shiftDetails, "Done"];
        });
        autoTable(doc, {
          startY: 20,
          head: [["STAFF MEMBER", "REQUESTED SHIFT", "STATUS"]],
          body: requestedShiftsData,
          theme: "grid",
          headStyles: { fillColor: [0, 0, 0] },
          styles: {
            fontSize: 9,
            halign: "center",
            valign: "middle",
            cellPadding: 2
          },
          columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 2) {
              data.cell.styles.fillColor = [22, 163, 74];
              data.cell.styles.textColor = [255, 255, 255];
              data.cell.styles.fontStyle = "bold";
            }
          }
        });
      }
      doc.save(`SkyOPS_Full_Report_${startDate}.pdf`);
      setIsGeneratingPdf(false);
    };
    const generateStaffExcelReport = async () => {
      setIsGeneratingExcel(true);
      try {
        const ExcelJS = await import("exceljs");
        const { saveAs } = await import("file-saver");
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Staff Program", {
          pageSetup: {
            paperSize: 9,
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5, header: 0, footer: 0 }
          }
        });
        const profile = await db.getUserProfile();
        sheet.columns = [
          { width: 10 },
          { width: 18 },
          { width: 10 },
          { width: 10 },
          { width: 10 },
          { width: 10 },
          { width: 15 },
          { width: 60 }
        ];
        const row1 = sheet.addRow([]);
        row1.height = 45;
        sheet.mergeCells("B1:G1");
        const titleCell = sheet.getCell("B1");
        titleCell.value = `ASE SDU Weekly Program From ${startDate} Till ${endDate}`;
        titleCell.font = { name: "Arial", size: 15, bold: true };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        if (profile?.companyLogo) {
          const base64Data = profile.companyLogo.split(";base64,")[1];
          const extMatch = profile.companyLogo.match(/image\/(jpeg|png)/);
          const extension = extMatch ? extMatch[1] : "png";
          const imgId = workbook.addImage({ base64: base64Data, extension });
          sheet.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 60, height: 45 } });
        }
        if (profile?.skyopsLogo) {
          const base64Data = profile.skyopsLogo.split(";base64,")[1];
          const extMatch = profile.skyopsLogo.match(/image\/(jpeg|png)/);
          const extension = extMatch ? extMatch[1] : "png";
          const imgId = workbook.addImage({ base64: base64Data, extension });
          sheet.addImage(imgId, { tl: { col: 7.1, row: 0.1 }, ext: { width: 60, height: 45 } });
        }
        const headers = ["S/N", "Flight No/Day", "From", "STA", "STD", "To", "Pick up Time", "SDU Staff Assignment (staff initials)"];
        const headerRow = sheet.addRow(headers);
        headerRow.height = 25;
        headerRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
          cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });
        activePrograms.forEach((prog) => {
          const d = new Date(prog.dateString || startDate);
          const dayName = DAYS_OF_WEEK_FULL[d.getUTCDay()];
          const dateFormatted = `${d.getUTCDate()}-${d.toLocaleString("default", { month: "short" }).toUpperCase()}-${d.getUTCFullYear().toString().substr(2)}`;
          const dayRow = sheet.addRow([`${dayName} ${dateFormatted}`, "", "", "", "", "", "", ""]);
          sheet.mergeCells(`A${dayRow.number}:H${dayRow.number}`);
          const dayHeaderCell = sheet.getCell(`A${dayRow.number}`);
          dayHeaderCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
          dayHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
          dayHeaderCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
          dayHeaderCell.alignment = { vertical: "middle", horizontal: "center" };
          dayRow.height = 24;
          const categories = {
            "Day off": [],
            "Annual": [],
            "Lieu": [],
            "Sick Leave": []
          };
          const workingIds = new Set(prog.assignments.map((a) => a.staffId));
          const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
          offStaff.forEach((s) => {
            const leave = hasLeaveOnDate(s.id, prog.dateString);
            let isRosterOutOfContract = false;
            if (s.workFromDate && s.workFromDate > prog.dateString) isRosterOutOfContract = true;
            if (s.workToDate && s.workToDate < prog.dateString) isRosterOutOfContract = true;
            let mappedCat = "";
            if (leave) {
              if (leave.type === "Annual leave") mappedCat = "Annual";
              else if (leave.type === "Roster leave") mappedCat = "Lieu";
              else if (leave.type === "Sick leave") mappedCat = "Sick Leave";
              else mappedCat = "Day off";
            } else if (isRosterOutOfContract) {
              mappedCat = "Lieu";
            } else {
              if (s.type === "Local") mappedCat = "Day off";
            }
            if (mappedCat && categories[mappedCat]) {
              categories[mappedCat].push({ initials: s.initials, isSecurity: s.isSecurity });
            }
          });
          const formatInitials = (staffList) => {
            const regular = staffList.filter((s) => !s.isSecurity).map((s) => s.initials);
            const security = staffList.filter((s) => s.isSecurity).map((s) => s.initials);
            let parts = [];
            if (regular.length > 0) parts.push(regular.join(" - "));
            if (security.length > 0) parts.push(`SEC : ${security.join(" - ")}`);
            return parts.join("\n");
          };
          const absenceRowsData = [];
          if (categories["Day off"].length > 0) {
            absenceRowsData.push({ category: "Day off", label: "DAY OFF", formattedText: formatInitials(categories["Day off"]) });
          }
          if (categories["Annual"].length > 0) {
            absenceRowsData.push({ category: "Annual", label: "ANNUAL LEAVE", formattedText: formatInitials(categories["Annual"]) });
          }
          if (categories["Lieu"].length > 0) {
            absenceRowsData.push({ category: "Lieu", label: "ROSTER LEAVE", formattedText: formatInitials(categories["Lieu"]) });
          }
          if (categories["Sick Leave"].length > 0) {
            absenceRowsData.push({ category: "Sick Leave", label: "SICK LEAVE", formattedText: formatInitials(categories["Sick Leave"]) });
          }
          const shiftsToday = shifts.filter((s) => s.pickupDate === prog.dateString).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
          shiftsToday.forEach((shift, idx) => {
            const assignments = sortAssignments(prog.assignments.filter((a) => a.shiftId === shift.id));
            let staffTokens = [];
            assignments.forEach((a) => {
              const s = getStaff(a.staffId);
              if (s) {
                const type = s.isDriver ? "driver" : s.isLabour ? "labour" : s.isSecurity ? "sec" : s.isAccountant ? "acc" : "reg";
                staffTokens.push({ text: s.initials, type });
              }
            });
            const flightIds = shift.flightIds || [];
            let fObjs = flightIds.map((fid) => getFlight(fid)).filter(Boolean);
            fObjs.sort((a, b) => {
              const getFlightTime = (f) => {
                if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
                  return f.sta;
                }
                if (f?.std && f.std.trim() !== "" && f.std !== "---") {
                  return f.std;
                }
                return "";
              };
              const getMinutes = (fTime) => {
                if (!fTime || fTime.toUpperCase().includes("NS") || fTime.includes("---")) return 9999;
                const parts = fTime.split(":");
                const fh = parseInt(parts[0]) || 0;
                const fm = parseInt(parts[1]) || 0;
                const ph = parseInt(shift.pickupTime.split(":")[0]) || 0;
                let totalMins = fh * 60 + fm;
                if (ph >= 12 && fh < 12) {
                  totalMins += 24 * 60;
                }
                return totalMins;
              };
              return getMinutes(getFlightTime(a)) - getMinutes(getFlightTime(b));
            });
            if (fObjs.length === 0) fObjs = [{}];
            const startRowNo = sheet.rowCount + 1;
            const addedRows = [];
            fObjs.forEach((f, fIndex) => {
              const rt = sheet.addRow([
                fIndex === 0 ? (idx + 1).toString() : "",
                f.flightNumber ? f.flightNumber.replace("/", " / ") : "",
                f.from || "",
                f.sta || "NS",
                f.std || "---",
                f.to || "",
                fIndex === 0 ? shift.pickupTime || "N.S" : "",
                ""
                // staff will be added later
              ]);
              addedRows.push(rt);
              rt.eachCell((cell) => {
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
                cell.font = { bold: true, size: 10 };
              });
              if (fIndex === 0) {
                const pickupCell = sheet.getCell(`G${rt.number}`);
                pickupCell.font = { bold: true, size: 10 };
                pickupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
              }
            });
            const endRowNo = sheet.rowCount;
            if (fObjs.length > 1) {
              sheet.mergeCells(`A${startRowNo}:A${endRowNo}`);
              sheet.mergeCells(`G${startRowNo}:G${endRowNo}`);
              sheet.mergeCells(`H${startRowNo}:H${endRowNo}`);
            }
            const staffCell = sheet.getCell(`H${startRowNo}`);
            const richText = [];
            const normalTokens = staffTokens.filter((t) => t.type === "reg");
            const accountantTokens = staffTokens.filter((t) => t.type === "acc");
            const labourTokens = staffTokens.filter((t) => t.type === "labour");
            const line1Tokens = [...normalTokens, ...accountantTokens, ...labourTokens];
            const securityTokens = staffTokens.filter((t) => t.type === "sec");
            const driverTokens = staffTokens.filter((t) => t.type === "driver");
            const line2Tokens = [...securityTokens, ...driverTokens];
            const addTokensToRichText = (tokens) => {
              tokens.forEach((t, i) => {
                let color = "FF000000";
                if (t.type === "driver") color = "FF15803D";
                if (t.type === "labour") color = "FFB91C1C";
                if (t.type === "sec") color = "FF7E22CE";
                if (t.type === "acc") color = "FF1D4ED8";
                if (i > 0) richText.push({ text: " - ", font: { color: { argb: "FF000000" }, bold: true } });
                richText.push({ text: t.text, font: { color: { argb: color }, bold: true } });
              });
            };
            if (line1Tokens.length > 0) {
              addTokensToRichText(line1Tokens);
            }
            if (line2Tokens.length > 0) {
              if (line1Tokens.length > 0) {
                richText.push({ text: "\n", font: { bold: true } });
              }
              addTokensToRichText(line2Tokens);
            }
            const shiftNote = prog.notes?.[shift.id] || shift.description || "";
            if (shiftNote) {
              if (richText.length > 0) richText.push({ text: "\n" });
              richText.push({ text: shiftNote, font: { color: { argb: "FFFF0000" }, bold: true } });
            }
            if (richText.length > 0) {
              staffCell.value = { richText };
            }
            staffCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            staffCell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
            let line1Text = line1Tokens.map((t) => t.text).join(" - ");
            let line2Text = line2Tokens.map((t) => t.text).join(" - ");
            let estimatedLines = 0;
            if (line1Text) estimatedLines += Math.ceil(line1Text.length / 40);
            if (line2Text) estimatedLines += Math.ceil(line2Text.length / 40);
            if (shiftNote) estimatedLines += Math.ceil(shiftNote.length / 40);
            let minLines = 1;
            if (line1Text && line2Text) minLines += 1;
            if (shiftNote) minLines += 1;
            estimatedLines = Math.max(minLines, estimatedLines);
            const totalHeightNeeded = Math.max(30, estimatedLines * 22 + 15);
            const perRowHeight = totalHeightNeeded / Math.max(1, fObjs.length);
            addedRows.forEach((row) => {
              row.height = Math.max(30, perRowHeight);
            });
          });
          let absStartRow = -1;
          let absEndRow = -1;
          absenceRowsData.forEach((absItem, idx) => {
            const note = prog.notes?.[`ABSENCE_${absItem.category}`];
            const fullStaffText = `${absItem.formattedText}${note ? `
(${note})` : ""}`;
            const mergedLabel = idx === 0 ? `${dayName} ${dateFormatted}` : "";
            let actualLabel = "";
            if (absItem.label === "DAY OFF") actualLabel = "Days Off";
            else if (absItem.label === "ANNUAL LEAVE") actualLabel = "Annual leave";
            else if (absItem.label === "ROSTER LEAVE") actualLabel = "Roster Leave";
            else if (absItem.label === "SICK LEAVE") actualLabel = "Sick Leave";
            else actualLabel = absItem.label;
            const absRow = sheet.addRow([
              mergedLabel,
              // Merged A-F
              "",
              // Flight No/Day
              "",
              // From
              "",
              // STA
              "",
              // STD
              "",
              // To
              actualLabel,
              // Pickup Time -> "Days Off" etc.
              fullStaffText
              // SDU Staff Assignment
            ]);
            if (idx === 0) absStartRow = absRow.number;
            absEndRow = absRow.number;
            absRow.eachCell((cell, colNumber) => {
              cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
              cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
              if (colNumber === 1) {
                cell.font = { bold: true, color: { argb: "FF92400E" }, size: 9 };
              } else if (colNumber === 2) {
                cell.font = { bold: true, color: { argb: "FF92400E" }, size: 10 };
              } else if (colNumber === 4 || colNumber === 5) {
                cell.font = { bold: true, color: { argb: "FFB45309" }, size: 9 };
              } else if (colNumber === 7) {
                cell.font = { bold: true, color: { argb: "FF92400E" }, size: 9 };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
              } else if (colNumber === 8) {
                cell.font = { bold: true, color: { argb: "FF78350F" }, size: 10 };
              } else {
                cell.font = { bold: true, color: { argb: "FF92400E" }, size: 9 };
              }
            });
            const estimatedLines = Math.max(1, Math.ceil(fullStaffText.length / 55));
            absRow.height = Math.max(28, estimatedLines * 22 + 10);
          });
          if (absStartRow !== -1 && absEndRow !== -1) {
            sheet.mergeCells(absStartRow, 1, absEndRow, 6);
          }
        });
        sheet.addRow([]);
        const fRow1 = sheet.addRow(["Prepared By: " + (profile?.preparedBy || "")]);
        const fRow2 = sheet.addRow(["Revised By: " + (profile?.revisedBy || "")]);
        fRow1.getCell(1).font = { bold: true, size: 10 };
        fRow2.getCell(1).font = { bold: true, size: 10 };
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        saveAs(blob, `SkyOPS_Staff_Program_${startDate}.xlsx`);
      } catch (err) {
        console.error(err);
        alert("Failed to export Excel report.");
      } finally {
        setIsGeneratingExcel(false);
      }
    };
    const generateStaffPdfReport = async () => {
      setIsGeneratingStaffPdf(true);
      try {
        const profile = await db.getUserProfile();
        const preparedBy = profile?.preparedBy || "";
        const revisedBy = profile?.revisedBy || "";
        const { jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;
        const doc = new jsPDF("l", "mm", "a3");
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        const title = `ASE SDU Weekly Program From ${startDate} Till ${endDate}`;
        doc.text(title, 210, 10, { align: "center" });
        try {
          if (profile?.companyLogo) doc.addImage(profile.companyLogo, "PNG", 5, 2, 15, 15);
          if (profile?.skyopsLogo) doc.addImage(profile.skyopsLogo, "PNG", 400, 2, 15, 15);
        } catch (e) {
        }
        const tableRows = [];
        activePrograms.forEach((prog) => {
          const d = new Date(prog.dateString || startDate);
          const dayName = DAYS_OF_WEEK_FULL[d.getUTCDay()];
          const dateFormatted = `${d.getUTCDate()}-${d.toLocaleString("default", { month: "short" }).toUpperCase()}-${d.getUTCFullYear().toString().substr(2)}`;
          const shiftsToday = shifts.filter((s) => s.pickupDate === prog.dateString).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
          const categories = {
            "Day off": [],
            "Annual": [],
            "Lieu": [],
            "Sick Leave": [],
            "SSH Support": []
          };
          const workingIds = new Set(prog.assignments.map((a) => a.staffId));
          const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
          offStaff.forEach((s) => {
            const leave = leaveMapByStaff[s.id]?.find(
              (l) => l.startDate <= prog.dateString && l.endDate >= prog.dateString
            );
            let isRosterOutOfContract = false;
            if (s.workFromDate && s.workFromDate > prog.dateString) isRosterOutOfContract = true;
            if (s.workToDate && s.workToDate < prog.dateString) isRosterOutOfContract = true;
            let mappedCat = "";
            if (leave) {
              if (leave.type === "Annual leave") mappedCat = "Annual";
              else if (leave.type === "Roster leave") mappedCat = "Lieu";
              else if (leave.type === "Sick leave") mappedCat = "Sick Leave";
              else mappedCat = "Day off";
            } else if (isRosterOutOfContract) {
              mappedCat = "Lieu";
            } else {
              if (s.type === "Local") mappedCat = "Day off";
            }
            if (mappedCat === "Day off") {
              mappedCat = "Day off";
            }
            if (mappedCat && categories[mappedCat]) {
              categories[mappedCat].push({ initials: s.initials, isSecurity: s.isSecurity });
            }
          });
          const absenceTextLines = [];
          Object.entries(categories).forEach(([k, v]) => {
            if (v.length > 0) {
              const note = prog.notes?.[`ABSENCE_${k}`];
              const regular = v.filter((s) => !s.isSecurity).map((s) => s.initials);
              const security = v.filter((s) => s.isSecurity).map((s) => s.initials);
              let parts = [];
              if (regular.length > 0) parts.push(regular.join(" - "));
              if (security.length > 0) parts.push(`SEC : ${security.join(" - ")}`);
              absenceTextLines.push(`${k}:
${parts.join("\n")}${note ? `
(${note})` : ""}`);
            }
          });
          const combinedAbsenceText = absenceTextLines.join(" | ");
          let headerText = `${dayName} ${dateFormatted}`;
          tableRows.push([
            { content: headerText, colSpan: 3, styles: { fillColor: [79, 129, 189], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" } },
            { content: combinedAbsenceText || "", colSpan: 5, styles: { fillColor: [79, 129, 189], textColor: [255, 255, 255], fontStyle: "bold", halign: "right" } }
          ]);
          if (shiftsToday.length === 0) {
            tableRows.push([
              { content: "No shifts", colSpan: 8, styles: { halign: "center" } }
            ]);
          } else {
            shiftsToday.forEach((shift, idx) => {
              const assignments = sortAssignmentsForPDF(prog.assignments.filter((a) => a.shiftId === shift.id));
              const staffTokens = assignments.map((a) => {
                const s = getStaff(a.staffId);
                if (!s) return null;
                let type = "traffic";
                if (s.isSecurity) type = "sec";
                else if (s.isLabour) type = "labour";
                else if (s.isDriver) type = "driver";
                return { text: s.initials, type };
              }).filter(Boolean);
              const normalTokens = staffTokens.filter((t) => t.type === "traffic");
              const labourTokens = staffTokens.filter((t) => t.type === "labour");
              const line1Tokens = [...normalTokens, ...labourTokens];
              const securityTokens = staffTokens.filter((t) => t.type === "sec");
              const driverTokens = staffTokens.filter((t) => t.type === "driver");
              const line2Tokens = [...securityTokens, ...driverTokens];
              const orderedStaffTokens = [...line1Tokens, ...line2Tokens];
              let pureInitialsLines = [];
              if (line1Tokens.length > 0) {
                pureInitialsLines.push(line1Tokens.map((t) => t.text).join("-"));
              }
              if (line2Tokens.length > 0) {
                pureInitialsLines.push(line2Tokens.map((t) => t.text).join("-"));
              }
              let pureInitials = pureInitialsLines.join("\n");
              const shiftNote = prog.notes?.[shift.id] || shift.description || "";
              if (shiftNote) {
                if (pureInitials) pureInitials += `
`;
                pureInitials += `${shiftNote}`;
              }
              const flightIds = shift.flightIds || [];
              let fObjs = flightIds.map((fid) => getFlight(fid)).filter(Boolean);
              fObjs.sort((a, b) => {
                const getFlightTime = (f) => {
                  if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
                    return f.sta;
                  }
                  if (f?.std && f.std.trim() !== "" && f.std !== "---") {
                    return f.std;
                  }
                  return "";
                };
                const getMinutes = (fTime) => {
                  if (!fTime || fTime.toUpperCase().includes("NS") || fTime.includes("---")) return 9999;
                  const parts = fTime.split(":");
                  const fh = parseInt(parts[0]) || 0;
                  const fm = parseInt(parts[1]) || 0;
                  const ph = parseInt(shift.pickupTime.split(":")[0]) || 0;
                  let totalMins = fh * 60 + fm;
                  if (ph >= 12 && fh < 12) {
                    totalMins += 24 * 60;
                  }
                  return totalMins;
                };
                return getMinutes(getFlightTime(a)) - getMinutes(getFlightTime(b));
              });
              if (fObjs.length === 0) {
                fObjs = [{ flightNumber: "", from: "", to: "", sta: "NS", std: "---" }];
              }
              const shiftColor = idx % 2 === 0 ? [255, 255, 255] : [245, 248, 255];
              const shiftBorder = 0.6;
              const flightBorder = 0.1;
              fObjs.forEach((f, fIdx) => {
                const isFirstFlight = fIdx === 0;
                const isLastFlight = fIdx === fObjs.length - 1;
                const rowStyles = {
                  fillColor: shiftColor,
                  lineWidth: { top: flightBorder, bottom: isLastFlight ? shiftBorder : flightBorder, left: flightBorder, right: flightBorder },
                  valign: "middle"
                };
                if (isFirstFlight) {
                  tableRows.push([
                    { content: (idx + 1).toString(), rowSpan: fObjs.length, styles: { ...rowStyles, lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } } },
                    { content: f.flightNumber || "", styles: rowStyles },
                    { content: f.from || "", styles: rowStyles },
                    { content: f.sta || "NS", styles: rowStyles },
                    { content: f.std || "---", styles: rowStyles },
                    { content: f.to || "", styles: rowStyles },
                    { content: shift.pickupTime || "N.S", rowSpan: fObjs.length, styles: { ...rowStyles, fontStyle: "bold", fontSize: 9, fillColor: [248, 250, 252], lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } } },
                    { content: pureInitials, rowSpan: fObjs.length, styles: { ...rowStyles, fontStyle: "bold", lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } }, customInitials: orderedStaffTokens, customNote: shiftNote }
                  ]);
                } else {
                  tableRows.push([
                    { content: f.flightNumber || "", styles: rowStyles },
                    { content: f.from || "", styles: rowStyles },
                    { content: f.sta || "NS", styles: rowStyles },
                    { content: f.std || "---", styles: rowStyles },
                    { content: f.to || "", styles: rowStyles }
                  ]);
                }
              });
            });
          }
        });
        autoTable(doc, {
          startY: 18,
          head: [["S/N", "Flight No/Day", "From", "STA", "STD", "To", "Pick up Time", "SDU Staff Assignment\n(staff initials)"]],
          body: tableRows,
          theme: "grid",
          margin: { top: 2, right: 3, bottom: 2, left: 3 },
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", lineColor: [0, 0, 0], lineWidth: 0.1, fontSize: 9 },
          styles: { fontSize: 9, fontStyle: "bold", cellPadding: 1, valign: "middle", halign: "center", lineColor: [150, 150, 150], lineWidth: 0.1, overflow: "linebreak" },
          columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 45 },
            2: { cellWidth: 20 },
            3: { cellWidth: 20 },
            4: { cellWidth: 20 },
            5: { cellWidth: 20 },
            6: { cellWidth: 35 },
            7: { cellWidth: "auto" }
          },
          willDrawCell: (data) => {
            if (data.column.index === 7 && data.cell.section === "body") {
              if (!data.cell.raw || typeof data.cell.raw !== "object" || !data.cell.raw.customInitials) return;
              data.cell.raw._lines = [...data.cell.text];
              data.cell.text = [];
            }
          },
          didDrawCell: (data) => {
            if (data.column.index === 7 && data.cell.section === "body") {
              const raw = data.cell.raw;
              if (!raw || !raw._lines) return;
              const lines = raw._lines;
              const customInitials = raw.customInitials || [];
              const customNote = raw.customNote;
              doc.setFontSize(data.cell.styles.fontSize);
              const lineHeight = doc.getLineHeight() * (data.cell.styles.lineHeightFactor || 1.15);
              const contentHeight = lines.length * lineHeight;
              const topPadding = typeof data.cell.padding === "function" ? data.cell.padding("top") : data.cell.padding.top || 0;
              const leftPadding = typeof data.cell.padding === "function" ? data.cell.padding("left") : data.cell.padding.left || 0;
              let cursorY = data.cell.y + topPadding;
              if (data.cell.styles.valign === "middle") {
                cursorY = data.cell.y + data.cell.height / 2 - contentHeight / 2 + lineHeight / 2;
              } else {
                cursorY += lineHeight / 2;
              }
              let reachedNoteRegion = false;
              for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                const normalizedLine = line.replace(/[\s\(\)]/g, "");
                const normalizedNote = customNote ? customNote.replace(/[\s\(\)]/g, "") : "";
                if (normalizedLine.length > 0 && normalizedNote && normalizedNote.includes(normalizedLine)) {
                  reachedNoteRegion = true;
                }
                const textWidth = doc.getTextWidth(line);
                let startX = data.cell.x + leftPadding;
                if (data.cell.styles.halign === "center") {
                  startX = data.cell.x + data.cell.width / 2 - textWidth / 2;
                }
                let cursorX = startX;
                const words = line.split(/(\s+|-|\(|\))/g);
                for (const word of words) {
                  if (!word) continue;
                  let color = [0, 0, 0];
                  let isBold = true;
                  if (reachedNoteRegion) {
                    color = [255, 0, 0];
                    isBold = true;
                  } else {
                    const token = customInitials.find((t) => t.text === word);
                    if (token) {
                      switch (token.type) {
                        case "driver":
                          color = [21, 128, 61];
                          break;
                        // Dark Green
                        case "labour":
                          color = [185, 28, 28];
                          break;
                        // Dark Red
                        case "sec":
                          color = [126, 34, 206];
                          break;
                        // Dark Purple
                        default:
                          color = [0, 0, 0];
                          break;
                      }
                    }
                  }
                  doc.setFont("helvetica", isBold ? "bold" : "normal");
                  doc.setTextColor(color[0], color[1], color[2]);
                  doc.text(word, cursorX, cursorY, { baseline: "middle" });
                  cursorX += doc.getTextWidth(word);
                }
                cursorY += lineHeight;
              }
            }
          }
        });
        const finalY = doc.lastAutoTable.finalY || 100;
        if (finalY > doc.internal.pageSize.getHeight() - 12) {
          doc.addPage();
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Prepared By : ${preparedBy}`, 14, 15);
          doc.text(`Revised By : ${revisedBy}`, 14, 22);
        } else {
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Prepared By : ${preparedBy}`, 14, finalY + 6);
          doc.text(`Revised By : ${revisedBy}`, 14, finalY + 12);
        }
        doc.save(`SkyOPS_Staff_Program_${startDate}.pdf`);
      } catch (err) {
        console.error(err);
        alert("Failed to export PDF report.");
      } finally {
        setIsGeneratingStaffPdf(false);
      }
    };
    const [shiftEditModal, setShiftEditModal] = import_react.default.useState(null);
    const [isShiftBulkEditMode, setIsShiftBulkEditMode] = import_react.default.useState(false);
    const [shiftBulkEditText, setShiftBulkEditText] = import_react.default.useState("");
    const handleDragStart = (e, staffId, currentShiftId, date, role) => {
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ staffId, currentShiftId, date, role })
      );
      e.dataTransfer.effectAllowed = "move";
    };
    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    };
    const handleUpdateNote = (dateString, targetId, note) => {
      if (!onUpdatePrograms) return;
      const newPrograms = programs.map((p) => {
        if (p.dateString === dateString) {
          return {
            ...p,
            notes: {
              ...p.notes || {},
              [targetId]: note
            }
          };
        }
        return p;
      });
      onUpdatePrograms(newPrograms);
    };
    const executeMove = (staffId, currentShiftId, date, role, targetShiftId, targetDate) => {
      if (date !== targetDate) return;
      const newPrograms = [...programs];
      const progIndex = newPrograms.findIndex((p) => p.dateString === targetDate);
      if (progIndex === -1) return;
      const prog = { ...newPrograms[progIndex], assignments: [...newPrograms[progIndex].assignments] };
      newPrograms[progIndex] = prog;
      const isTargetAbsence = targetShiftId.startsWith("ABSENCE");
      if (!currentShiftId.startsWith("ABSENCE")) {
        const staffObj = activeStaff.find((s) => s.id === staffId);
        const isDriver = staffObj?.isDriver;
        if (currentShiftId === targetShiftId) {
          const existingIdx = prog.assignments.findIndex(
            (a) => a.staffId === staffId && a.shiftId === targetShiftId
          );
          if (existingIdx !== -1) {
            const minSort = Math.min(0, ...prog.assignments.map((a) => a.manualSortIndex || 0));
            prog.assignments[existingIdx].manualSortIndex = minSort - 1;
            onUpdatePrograms(newPrograms);
          }
          return;
        }
        const oldIdx = prog.assignments.findIndex(
          (a) => a.staffId === staffId && a.shiftId === currentShiftId
        );
        if (oldIdx !== -1) {
          prog.assignments.splice(oldIdx, 1);
        }
      } else if (currentShiftId.startsWith("ABSENCE_") && targetShiftId !== currentShiftId) {
        const leavesToDelete = leaveRequests.filter(
          (l) => l.staffId === staffId && l.startDate <= targetDate && l.endDate >= targetDate
        );
        if (leavesToDelete.length > 0) {
          Promise.all(leavesToDelete.map((l) => db.deleteLeave(l.id))).then(() => {
            if (onUpdateLeaves) {
              const remaining = leaveRequests.filter((l) => !leavesToDelete.includes(l));
              onUpdateLeaves(remaining);
            }
          });
        }
      }
      if (!isTargetAbsence && targetShiftId !== "OFFDUTY") {
        const exists = prog.assignments.some(
          (a) => a.staffId === staffId && a.shiftId === targetShiftId
        );
        if (!exists) {
          const maxSort = Math.max(0, ...prog.assignments.map((a) => a.manualSortIndex || 0));
          prog.assignments.push({
            id: Math.random().toString(36).substr(2, 9),
            staffId,
            shiftId: targetShiftId,
            flightId: "",
            role: role || "OPS",
            manualSortIndex: maxSort + 1
          });
        }
      } else if (isTargetAbsence && targetShiftId !== "ABSENCE") {
        const cat = targetShiftId.replace("ABSENCE_", "");
        let type = null;
        if (cat === "ANNUAL LEAVE") type = "Annual leave";
        if (cat === "SICK LEAVE") type = "Sick leave";
        if (cat === "ROSTER LEAVE") type = "Roster leave";
        if (cat === "DAYS OFF") type = null;
        const st = activeStaff.find((s) => s.id === staffId);
        if (type === "Roster leave" && st?.type === "Local") {
          return;
        }
        if (type) {
          const newLeaveId = Math.random().toString(36).substr(2, 9);
          const req = {
            id: newLeaveId,
            staffId,
            type,
            startDate: targetDate,
            endDate: targetDate,
            notes: "Assigned visually",
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          db.upsertLeave(req).then(() => {
            if (onUpdateLeaves) {
              const prevLeaves = leaveRequests.filter((l) => !(l.staffId === staffId && l.startDate <= targetDate && l.endDate >= targetDate));
              onUpdateLeaves([...prevLeaves, req]);
            }
          });
        }
      }
      onUpdatePrograms(newPrograms);
    };
    const handleDrop = (e, targetShiftId, targetDate) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      try {
        const { staffId, currentShiftId, date, role } = JSON.parse(data);
        executeMove(staffId, currentShiftId, date, role, targetShiftId, targetDate);
      } catch (err) {
        console.error("Drop failed", err);
      }
    };
    const handleTargetContainerTap = (targetShiftId, targetDate) => {
      if (!targetShiftId.startsWith("ABSENCE") && targetShiftId !== "OFFDUTY") {
        setShiftEditModal({ dateString: targetDate, shiftId: targetShiftId });
      }
    };
    const [staffActionModal, setStaffActionModal] = import_react.default.useState(null);
    const handleStaffItemTap = (e, staffId, currentShiftId, date, role) => {
      e.stopPropagation();
      setStaffActionModal({ staffId, currentShiftId, date, role });
    };
    const staffStats = import_react.default.useMemo(() => {
      const stats = {};
      const leaveMap = {};
      leaveRequests.forEach((l) => {
        if (!leaveMap[l.staffId]) leaveMap[l.staffId] = [];
        leaveMap[l.staffId].push(l);
      });
      const progAssignments = {};
      activePrograms.forEach((p) => {
        progAssignments[p.dateString || ""] = p.assignments.map((a) => a.staffId);
      });
      staff.forEach((s) => {
        let daysWorked = 0;
        let excusedLeaves = 0;
        activePrograms.forEach((p) => {
          const pDate = p.dateString || "";
          const worked = progAssignments[pDate].includes(s.id);
          if (worked) daysWorked++;
          const leaves = leaveMap[s.id] || [];
          const hasLeave = leaves.some(
            (l) => l.type !== "Day off" && l.startDate <= pDate && l.endDate >= pDate
          );
          if (hasLeave && !worked) {
            excusedLeaves++;
          }
        });
        let target = 5;
        if (s.type === "Roster") {
          const progStart = new Date(startDate);
          const progEnd = new Date(endDate);
          const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
          const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
          const overlapStart = workFrom > progStart ? workFrom : progStart;
          const overlapEnd = workTo < progEnd ? workTo : progEnd;
          if (overlapStart <= overlapEnd) {
            target = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1e3 * 60 * 60 * 24)) + 1;
          } else {
            target = 0;
          }
        }
        target -= excusedLeaves;
        stats[s.id] = { daysWorked, excusedLeaves, target };
      });
      return stats;
    }, [activePrograms, staff, leaveRequests, startDate, endDate]);
    const getStaffWorkload = (staffId) => {
      return staffStats[staffId]?.daysWorked || 0;
    };
    const getStaffColor = (s, daysWorked, restHours) => {
      if (restHours !== null && restHours < minRestHours) {
        return "bg-orange-500 text-white border-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]";
      }
      const target = staffStats[s.id]?.target ?? 5;
      const diff = daysWorked - target;
      if (diff >= 2)
        return "bg-gradient-to-br from-red-500 to-rose-700 text-white shadow-red-500/20";
      if (diff === 1)
        return "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-orange-500/20";
      if (diff === 0) return "bg-white border-slate-200 text-slate-900 shadow-sm";
      if (diff === -1)
        return "bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-blue-500/20";
      return "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-indigo-500/20";
    };
    const renderMatrixTab = () => {
      const dateHeaders = activePrograms.map((p) => {
        const d = new Date(p.dateString || startDate);
        return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      });
      const getStaffTypeRank = (s) => {
        if (s.isDriver) return 5;
        if (s.isLabour) return 4;
        if (s.isSecurity) return 3;
        if (s.isAccountant) return 2;
        return 1;
      };
      const sortedMatrixStaff = [...activeStaff].map((s) => ({
        ...s,
        totalHours: getStaffTotalHours(s.id)
      })).sort((a, b) => {
        const rankA = getStaffTypeRank(a);
        const rankB = getStaffTypeRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return a.totalHours - b.totalHours;
      });
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6", children: "Weekly Operations Matrix View" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left border-collapse min-w-[800px]", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 text-center border-r border-slate-800 rounded-tl-xl", children: "S/N" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800", children: "Agent" }),
            dateHeaders.map((dh, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "th",
              {
                className: "px-4 py-3 text-center border-r border-slate-800",
                children: dh
              },
              i
            )),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 text-center bg-indigo-600 border-l border-indigo-700 rounded-tr-xl", children: "Audit" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "text-xs font-medium text-slate-700 divide-y divide-slate-100", children: sortedMatrixStaff.map((s, idx) => {
            let workedCount = 0;
            let excusedLeaves = 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "hover:bg-slate-50 transition-colors", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center border-r border-slate-100", children: idx + 1 }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "px-4 py-2 font-bold border-r border-slate-100 whitespace-nowrap", children: [
                s.name,
                " (",
                s.initials,
                ")"
              ] }),
              activePrograms.map((p, i) => {
                const hasLeave = hasLeaveOnDate(s.id, p.dateString, true);
                if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
                  excusedLeaves++;
                const assign = p.assignments.find(
                  (a) => a.staffId === s.id
                );
                const refProg = referencePrograms.find(
                  (rp) => rp.dateString === p.dateString
                );
                const refAssign = refProg?.assignments.find(
                  (a) => a.staffId === s.id
                );
                const isCellModified = assign?.shiftId !== refAssign?.shiftId || assign?.role !== refAssign?.role || !!assign !== !!refAssign;
                let content = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-300", children: "-" });
                let cellClass = `px-4 py-2 text-center border-r border-slate-100 ${isCellModified ? "bg-indigo-100/50 shadow-inner" : ""}`;
                if (assign) {
                  workedCount++;
                  const shift = getShift(assign.shiftId || "");
                  if (shift) {
                    const pDate = new Date(p.dateString);
                    const [ph, pm] = shift.pickupTime.split(":").map(Number);
                    const shiftStart = new Date(pDate);
                    shiftStart.setHours(ph, pm, 0, 0);
                    const rest = calculateRestHours(s.id, shiftStart);
                    const restWarning = rest !== null && rest < minRestHours;
                    if (restWarning) {
                      cellClass += " bg-rose-50";
                    }
                    content = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col items-center gap-1", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                        "span",
                        {
                          className: `font-bold ${restWarning ? "text-rose-600" : "text-slate-900"}`,
                          children: shift.pickupTime
                        }
                      ),
                      rest !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "span",
                        {
                          className: `text-[8px] font-bold px-1.5 py-0.5 rounded ${restWarning ? "bg-rose-500 text-white" : "text-slate-500 bg-slate-100"}`,
                          children: [
                            rest.toFixed(1),
                            "H"
                          ]
                        }
                      )
                    ] });
                  } else {
                    content = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-rose-500 font-bold", children: "ERR" });
                  }
                }
                return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: cellClass, children: content }, i);
              }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "px-4 py-2 text-center border-l-2 border-indigo-100 bg-indigo-50/50", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `font-bold ${s.type === "Local" && workedCount > Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7)) ? "text-rose-600" : "text-indigo-900"}`, children: [
                  workedCount,
                  "/",
                  activePrograms.length
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-[10px] text-indigo-600 font-bold mt-0.5 flex items-center justify-center gap-1", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                  "[",
                  s.totalHours.toFixed(1),
                  "H]"
                ] }) }),
                excusedLeaves > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-[9px] text-rose-500 font-bold mt-0.5", children: [
                  "(+",
                  excusedLeaves,
                  " AL)"
                ] }),
                s.type === "Local" && workedCount > Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7)) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-[9px] text-rose-600 font-bold mt-1 bg-rose-100 px-1 py-0.5 rounded inline-block", children: [
                  "\u26A0\uFE0F MAX ",
                  Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7))
                ] })
              ] })
            ] }, s.id);
          }) })
        ] })
      ] });
    };
    const renderRolesTab = () => {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6", children: "Specialist Role Fulfillment Matrix" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left border-collapse min-w-[800px]", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 rounded-tl-xl w-24", children: "Date" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 w-32", children: "Shift" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "SL" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "LC" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "RMP" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "OPS" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 text-center rounded-tr-xl", children: "LF" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "text-xs font-medium text-slate-700 divide-y divide-slate-100", children: activePrograms.map((p, pIdx) => {
            const d = new Date(p.dateString || startDate);
            const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
            const shiftsToday = shifts.filter((s) => s.pickupDate === p.dateString).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
            return shiftsToday.map((s, sIdx) => {
              const assignments = p.assignments.filter(
                (a) => a.shiftId === s.id
              );
              const coversRole = (a, targetRole) => {
                const st = getStaff(a.staffId);
                if (!st) return false;
                const roleCode = targetRole === "Shift Leader" ? "SL" : targetRole === "Load Control" ? "LC" : targetRole === "Ramp" ? "RMP" : targetRole === "Operations" ? "OPS" : targetRole === "Lost and Found" ? "LF" : targetRole;
                if (roleCode === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
                if (roleCode === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
                if (roleCode === "RMP" && !st.isRamp) return false;
                if (roleCode === "OPS" && !st.isOps) return false;
                if (roleCode === "LF" && !st.isLostFound) return false;
                if ((roleCode === "Labour" || roleCode === "LBR") && !st.isLabour) return false;
                if (a.role === roleCode || a.role === targetRole) return true;
                if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
                if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
                if (roleCode === "RMP" && st.isRamp) return true;
                if (roleCode === "OPS" && st.isOps) return true;
                if (roleCode === "LF" && st.isLostFound) return true;
                if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
                return false;
              };
              const getRoleCell = (role, reqFlag) => {
                const agents = assignments.filter((a) => coversRole(a, role)).map((a) => getStaff(a.staffId)?.initials).filter(Boolean);
                if (agents.length > 0) {
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 border-r border-slate-100 text-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bg-emerald-500 text-white font-black px-2 py-1 rounded-lg text-[10px] break-words inline-block", children: agents.join(", ") }) });
                } else if (reqFlag) {
                  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 border-r border-slate-100 text-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "bg-rose-500 text-white font-black px-2 py-1 rounded-lg text-[10px]", children: "MISSING" }) });
                }
                return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 border-r border-slate-100 text-center text-slate-300", children: "-" });
              };
              const meta = {
                slReq: (s.roleCounts?.["Shift Leader"] || s.roleCounts?.["SL"] || 0) > 0,
                lcReq: (s.roleCounts?.["Load Control"] || s.roleCounts?.["LC"] || 0) > 0,
                rmpReq: (s.roleCounts?.["Ramp"] || s.roleCounts?.["RMP"] || 0) > 0,
                opsReq: (s.roleCounts?.["Operations"] || s.roleCounts?.["OPS"] || 0) > 0,
                lfReq: (s.roleCounts?.["Lost and Found"] || s.roleCounts?.["LF"] || 0) > 0
              };
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "tr",
                {
                  className: "hover:bg-slate-50 transition-colors",
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 font-bold border-r border-slate-100", children: dateLabel }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "px-4 py-2 font-bold border-r border-slate-100 whitespace-nowrap", children: [
                      s.pickupTime,
                      "-",
                      s.endTime
                    ] }),
                    getRoleCell("Shift Leader", meta.slReq),
                    getRoleCell("Load Control", meta.lcReq),
                    getRoleCell("Ramp", meta.rmpReq),
                    getRoleCell("Operations", meta.opsReq),
                    getRoleCell("Lost and Found", meta.lfReq)
                  ]
                },
                `${pIdx}-${sIdx}`
              );
            });
          }) })
        ] })
      ] });
    };
    const renderStaffCheckTab = () => {
      const localStaff = activeStaff.filter((s) => s.type === "Local");
      const rosterStaff = activeStaff.filter((s) => s.type === "Roster");
      const renderLocalTable = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-10 min-w-[800px]", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-lg font-black uppercase italic text-slate-800 mb-4", children: "Weekly Personnel Utilization Audit (Local)" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left border-collapse", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 rounded-tl-xl w-16 text-center", children: "S/N" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800", children: "NAME" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "INIT" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "WORK SHIFTS" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "OFF DAYS" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "LEAVES" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 text-center rounded-tr-xl", children: "STATUS" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "text-xs font-medium divide-y divide-slate-100", children: localStaff.map((s, idx) => {
            const shiftsWorked = activePrograms.reduce(
              (acc, p) => acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
              0
            );
            let excusedLeaves = 0;
            activePrograms.forEach((p) => {
              const hasLeave = hasLeaveOnDate(s.id, p.dateString, true);
              if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
                excusedLeaves++;
            });
            const daysOff = activePrograms.length - shiftsWorked - excusedLeaves;
            const targetShifts = 5 - excusedLeaves;
            const targetOff = 2;
            const isMatch = shiftsWorked === targetShifts && daysOff === targetOff;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "tr",
              {
                className: isMatch ? "bg-emerald-50 text-emerald-900 border-b border-white" : "bg-rose-50 text-rose-900 border-b border-white",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: idx + 1 }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 font-bold", children: s.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: s.initials }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: shiftsWorked }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: daysOff }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center font-bold text-slate-700", children: excusedLeaves > 0 ? excusedLeaves : "-" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center font-bold", children: isMatch ? "MATCH" : "CHECK" })
                ]
              },
              s.id
            );
          }) })
        ] })
      ] });
      const renderRosterTable = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-10 min-w-[800px]", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-lg font-black uppercase italic text-slate-800 mb-4", children: "Weekly Personnel Utilization Audit (Roster)" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left border-collapse", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 rounded-tl-xl w-16 text-center", children: "S/N" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800", children: "NAME" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "INIT" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "WORK FROM" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "WORK TO" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "POTENTIAL" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "ACTUAL" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 border-r border-slate-800 text-center", children: "LEAVES" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 text-center rounded-tr-xl", children: "STATUS" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "text-xs font-medium divide-y divide-slate-100", children: rosterStaff.map((s, idx) => {
            const shiftsWorked = activePrograms.reduce(
              (acc, p) => acc + (p.assignments.some((a) => a.staffId === s.id) ? 1 : 0),
              0
            );
            const progStart = new Date(startDate);
            const progEnd = new Date(endDate);
            const workFrom = s.workFromDate ? new Date(s.workFromDate) : progStart;
            const workTo = s.workToDate ? new Date(s.workToDate) : progEnd;
            const overlapStart = workFrom > progStart ? workFrom : progStart;
            const overlapEnd = workTo < progEnd ? workTo : progEnd;
            let potential = 0;
            if (overlapStart <= overlapEnd) {
              potential = Math.floor(
                (overlapEnd.getTime() - overlapStart.getTime()) / (1e3 * 60 * 60 * 24)
              ) + 1;
            }
            let excusedLeaves = 0;
            activePrograms.forEach((p) => {
              const d = new Date(p.dateString);
              if (d >= overlapStart && d <= overlapEnd) {
                const hasLeave = hasLeaveOnDate(s.id, p.dateString, true);
                if (hasLeave && !p.assignments.some((a) => a.staffId === s.id))
                  excusedLeaves++;
              }
            });
            const isMatch = shiftsWorked === potential - excusedLeaves;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "tr",
              {
                className: isMatch ? "bg-emerald-50 text-emerald-900 border-b border-white" : "bg-rose-50 text-rose-900 border-b border-white",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: idx + 1 }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 font-bold", children: s.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: s.initials }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: s.workFromDate || "N/A" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: s.workToDate || "N/A" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: potential }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center", children: shiftsWorked }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center font-bold text-slate-700", children: excusedLeaves > 0 ? excusedLeaves : "-" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-2 text-center font-bold", children: isMatch ? "MATCH" : "CHECK" })
                ]
              },
              s.id
            );
          }) })
        ] })
      ] });
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6 flex items-center gap-3", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ShieldCheck, { className: "text-emerald-500 w-6 h-6 md:w-8 md:h-8" }),
          "Staff Matrix Checks"
        ] }),
        renderLocalTable(),
        renderRosterTable()
      ] });
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "space-y-8 pb-24 animate-in fade-in duration-500", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-slate-950 text-white p-6 md:p-10 rounded-3xl shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-4 md:gap-6 relative z-10 flex-col md:flex-row text-center md:text-left", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "w-12 h-12 md:w-16 md:h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.CalendarDays, { size: 24, className: "md:w-8 md:h-8" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-2xl md:text-3xl font-black uppercase italic tracking-tighter text-white leading-none", children: "Master Roster" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-2", children: "Program View & Export" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-4 relative z-10 flex-wrap justify-end mt-4 md:mt-0", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: () => setShowHistory(!showHistory),
              className: `px-4 md:px-6 py-4 md:py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl flex items-center gap-3 active:scale-95 ${showHistory ? "bg-emerald-500 text-white" : "bg-white text-slate-950 hover:bg-slate-100"}`,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.History, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hidden md:inline", children: "Time Machine" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: saveVersion,
              className: "px-4 md:px-6 py-4 md:py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 transition-all shadow-xl flex items-center gap-3 active:scale-95",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Save, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hidden md:inline", children: "Save Ver" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: generateFullReport,
              disabled: isGeneratingPdf || activePrograms.length === 0,
              className: "px-4 md:px-8 py-4 md:py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 hover:text-white transition-all shadow-xl flex items-center gap-2 md:gap-3 active:scale-95 disabled:opacity-50",
              title: "Export Internal Full Report PDF",
              children: [
                isGeneratingPdf ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Printer, { size: 18, className: "animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.FileDown, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hidden md:inline", children: "Internal PDF" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: generateStaffPdfReport,
              disabled: isGeneratingStaffPdf || activePrograms.length === 0,
              className: "px-4 md:px-8 py-4 md:py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-500 transition-all shadow-xl flex items-center gap-2 md:gap-3 active:scale-95 disabled:opacity-50",
              children: [
                isGeneratingStaffPdf ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Printer, { size: 18, className: "animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.FileDown, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Staff PDF" })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: generateStaffExcelReport,
              disabled: isGeneratingExcel || activePrograms.length === 0,
              className: "px-4 md:px-8 py-4 md:py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-500 transition-all shadow-xl flex items-center gap-2 md:gap-3 active:scale-95 disabled:opacity-50",
              children: [
                isGeneratingExcel ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Printer, { size: 18, className: "animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.FileDown, { size: 18 }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Staff EXCEL" })
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex flex-wrap gap-2 md:gap-4 md:justify-center px-2", children: ["Daily", "Matrix", "Roles", "Staff Checks"].map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          onClick: () => setActiveTab(tab),
          className: `px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex-1 md:flex-none ${activeTab === tab ? "bg-slate-950 text-white shadow-xl scale-105" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"}`,
          children: [
            tab,
            " View"
          ]
        },
        tab
      )) }),
      showHistory && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white border-2 border-slate-200 rounded-[2.5rem] p-8 shadow-xl animate-in slide-in-from-top-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex justify-between items-center mb-6", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "text-xl font-black uppercase italic text-slate-900 flex items-center gap-3", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.History, { className: "text-emerald-500" }),
            "Roster Time Machine"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              onClick: () => setShowHistory(false),
              className: "text-slate-400 hover:text-slate-600 font-bold text-xs uppercase",
              children: "Close"
            }
          )
        ] }),
        versions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-center py-12 text-slate-400 italic", children: "No saved versions found. Save your first snapshot!" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "space-y-4 max-h-96 overflow-y-auto pr-2", children: versions.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            className: "flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-4", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400 font-black text-xs border border-slate-100", children: [
                  "v",
                  v.versionNumber
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "font-bold text-slate-800 text-sm", children: v.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-3 mt-1", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Clock, { size: 10 }),
                      " ",
                      new Date(v.createdAt).toLocaleString()
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full", children: [
                      v.periodStart,
                      " \u2192 ",
                      v.periodEnd
                    ] })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    onClick: () => restoreVersion(v),
                    className: "px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-400 shadow-sm flex items-center gap-2",
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.RotateCcw, { size: 12 }),
                      " Restore"
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: () => deleteVersion(v.id),
                    className: "p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors",
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Trash2, { size: 16 })
                  }
                )
              ] })
            ]
          },
          v.id
        )) })
      ] }),
      (isFailedGeneration || stationHealth === 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-rose-50 border-2 border-rose-200 rounded-[2.5rem] p-8 md:p-12 text-center animate-in zoom-in-95 shadow-xl", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.AlertTriangle, { size: 64, className: "mx-auto text-rose-500 mb-6" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-2xl font-black uppercase italic text-rose-900 tracking-tighter mb-2", children: "AI Generation Failed" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-rose-700 font-bold max-w-lg mx-auto", children: "The Artificial Intelligence engine encountered a strategic conflict or returned invalid data structure." }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-6 flex justify-center gap-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "px-6 py-3 bg-white rounded-xl border border-rose-100 shadow-sm text-xs font-black uppercase text-slate-600", children: "Code: JSON_PARSE_ERROR" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "px-6 py-3 bg-white rounded-xl border border-rose-100 shadow-sm text-xs font-black uppercase text-slate-600", children: [
            "Health: ",
            stationHealth,
            "%"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-[10px] uppercase font-black tracking-widest text-rose-400 mt-8", children: "Recommendation: Check Shift/Staff Inputs and Retry" })
      ] }),
      !isFailedGeneration && stationHealth > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "space-y-12", children: activePrograms.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col items-center justify-center h-full py-20 text-slate-300 gap-4 bg-white rounded-[2.5rem] border border-slate-100", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.AlertTriangle, { size: 48 }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-xl font-black uppercase italic", children: "No Program Data for Selected Period" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        activeTab === "Matrix" && renderMatrixTab(),
        activeTab === "Roles" && renderRolesTab(),
        activeTab === "Staff Checks" && renderStaffCheckTab(),
        activeTab === "Daily" && activePrograms.map((prog, i) => {
          const d = new Date(prog.dateString || startDate);
          const dateLabel = `${DAYS_OF_WEEK_FULL[d.getUTCDay()].toUpperCase()} - ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
          const workingIds = new Set(
            prog.assignments.map((a) => a.staffId)
          );
          const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
          const categories = {
            "DAYS OFF": [],
            "ROSTER LEAVE": [],
            "ANNUAL LEAVE": [],
            "SICK LEAVE": [],
            "STANDBY (RESERVE)": []
          };
          offStaff.forEach((s) => {
            const leave = hasLeaveOnDate(s.id, prog.dateString);
            let count = 1;
            if (leave) {
              const start = new Date(leave.startDate);
              const current = new Date(prog.dateString);
              count = Math.floor(
                (current.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)
              ) + 1;
            } else {
              for (let idx = i - 1; idx >= 0; idx--) {
                const prevProg = activePrograms[idx];
                const worked = prevProg.assignments.some(
                  (a) => a.staffId === s.id
                );
                const prevLeave = hasLeaveOnDate(s.id, prevProg.dateString);
                if (!worked && !prevLeave) count++;
                else break;
              }
            }
            let isRosterOutOfContract = false;
            if (s.type === "Roster") {
              if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                isRosterOutOfContract = !s.rosterPeriods.some(
                  (p) => prog.dateString >= p.start && prog.dateString <= p.end
                );
              } else if (s.workFromDate && s.workToDate) {
                isRosterOutOfContract = prog.dateString < s.workFromDate || prog.dateString > s.workToDate;
              }
            }
            const item = {
              staff: s,
              count,
              isLeave: !!leave,
              isRequestedDayOff: leave?.type === "Day off"
            };
            if (leave) {
              if (leave.type === "Annual leave")
                categories["ANNUAL LEAVE"].push(item);
              else if (leave.type === "Roster leave")
                categories["ROSTER LEAVE"].push(item);
              else if (leave.type === "Sick leave")
                categories["SICK LEAVE"].push(item);
              else categories["DAYS OFF"].push(item);
            } else if (isRosterOutOfContract) {
              categories["ROSTER LEAVE"].push(item);
            } else {
              if (s.type === "Local") {
                categories["DAYS OFF"].push(item);
              } else {
                categories["STANDBY (RESERVE)"].push(item);
              }
            }
          });
          const refProg = referencePrograms.find(
            (p) => p.dateString === prog.dateString
          ) || {
            assignments: [],
            dateString: prog.dateString
          };
          const refWorkingIds = new Set(
            refProg.assignments.map((a) => a.staffId)
          );
          const refOffStaff = activeStaff.filter(
            (s) => !refWorkingIds.has(s.id)
          );
          const refCategories = {
            "DAYS OFF": [],
            "ROSTER LEAVE": [],
            "ANNUAL LEAVE": [],
            "SICK LEAVE": [],
            "STANDBY (RESERVE)": []
          };
          refOffStaff.forEach((s) => {
            const leave = hasLeaveOnDate(s.id, refProg.dateString);
            let isRosterOutOfContract = false;
            if (s.type === "Roster") {
              if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                isRosterOutOfContract = !s.rosterPeriods.some(
                  (p) => refProg.dateString >= p.start && refProg.dateString <= p.end
                );
              } else if (s.workFromDate && s.workToDate) {
                isRosterOutOfContract = refProg.dateString < s.workFromDate || refProg.dateString > s.workToDate;
              }
            }
            if (leave) {
              if (leave.type === "Annual leave")
                refCategories["ANNUAL LEAVE"].push(s.id);
              else if (leave.type === "Roster leave")
                refCategories["ROSTER LEAVE"].push(s.id);
              else if (leave.type === "Sick leave")
                refCategories["SICK LEAVE"].push(s.id);
              else refCategories["DAYS OFF"].push(s.id);
            } else if (isRosterOutOfContract) {
              refCategories["ROSTER LEAVE"].push(s.id);
            } else {
              if (s.type === "Local")
                refCategories["DAYS OFF"].push(s.id);
              else refCategories["STANDBY (RESERVE)"].push(s.id);
            }
          });
          const shiftsTodaySorted = shifts.filter((s) => s.pickupDate === prog.dateString).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              className: "bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-lg font-black uppercase italic text-slate-900", children: dateLabel }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "px-2 py-1 bg-slate-900 text-white rounded-md", children: [
                      "Total: ",
                      staff.length
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md", children: [
                      "Work: ",
                      workingIds.size
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "px-2 py-1 bg-slate-200 text-slate-700 rounded-md", children: [
                      "Off: ",
                      categories["DAYS OFF"].length
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "px-2 py-1 bg-indigo-100 text-indigo-700 rounded-md", children: [
                      "Leave:",
                      " ",
                      categories["ANNUAL LEAVE"].length + categories["SICK LEAVE"].length
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "px-2 py-1 bg-amber-100 text-amber-700 rounded-md", children: [
                      "SBY: ",
                      categories["STANDBY (RESERVE)"].length
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "px-2 py-1 bg-rose-100 text-rose-700 rounded-md", children: [
                      "Roster Off: ",
                      categories["ROSTER LEAVE"].length
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "overflow-x-auto", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left border-collapse", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 w-12 text-center", children: "S/N" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 w-24", children: "Pickup" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 w-24", children: "Release" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 w-32", children: "Flights" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3 w-24 text-center", children: "HC / Max" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-3", children: "Personnel & Assigned Roles" })
                  ] }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "text-xs font-medium text-slate-700 divide-y divide-slate-100", children: shiftsTodaySorted.map(
                    (shift, idx, shiftsToday) => {
                      const assignments = sortAssignments(prog.assignments.filter(
                        (a) => a.shiftId === shift.id
                      ));
                      const flightStrs = sortFlightsByTime(shift.flightIds || [], shift.pickupTime);
                      const nonLabourCount = assignments.filter((a) => {
                        const st = getStaff(a.staffId);
                        return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
                      }).length;
                      const isFull = nonLabourCount >= shift.maxStaff;
                      const isOver = nonLabourCount > shift.maxStaff;
                      const hasSL = assignments.some(
                        (a) => a.role === "SL" || a.role === "Shift Leader" || getStaff(a.staffId)?.isShiftLeader || getStaff(
                          a.staffId
                        )?.initials.toUpperCase() === "SK-ATZ"
                      );
                      const hasLC = assignments.some(
                        (a) => a.role === "LC" || a.role === "Load Control" || getStaff(a.staffId)?.isLoadControl || getStaff(
                          a.staffId
                        )?.initials.toUpperCase() === "SK-ATZ"
                      );
                      const isCriticalMissing = !hasSL && (shift.roleCounts?.["Shift Leader"] || 0) > 0 || !hasLC && (shift.roleCounts?.["Load Control"] || 0) > 0;
                      const curShiftAssig = assignments.map((a) => a.staffId).sort().join(",");
                      const refShiftAssig = refProg.assignments.filter((a) => a.shiftId === shift.id).map((a) => a.staffId).sort().join(",");
                      const isShiftModified = curShiftAssig !== refShiftAssig;
                      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "tr",
                        {
                          onDragOver: handleDragOver,
                          onDrop: (e) => handleDrop(e, shift.id, prog.dateString),
                          onClick: () => handleTargetContainerTap(shift.id, prog.dateString),
                          className: `hover:bg-slate-50 transition-colors ${isShiftModified ? "bg-indigo-50/70 border-l-4 border-indigo-400" : isCriticalMissing ? "bg-rose-50/50" : ""} ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-indigo-50" : ""}`,
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "td",
                              {
                                className: `px-4 py-3 text-center font-bold ${isCriticalMissing ? "text-rose-500" : "text-slate-400"}`,
                                children: idx + 1
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 font-mono", children: shift.pickupTime }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 font-mono", children: shift.endTime }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 font-bold text-blue-600", children: flightStrs }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                              "td",
                              {
                                className: `px-4 py-3 text-center font-bold ${isOver ? "text-rose-500" : isFull ? "text-emerald-500" : "text-amber-500"}`,
                                children: [
                                  nonLabourCount,
                                  " / ",
                                  shift.maxStaff
                                ]
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col gap-2", children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-wrap gap-2", children: [
                                assignments.map((a) => {
                                  const st = getStaff(a.staffId);
                                  if (!st) return null;
                                  const pDate = new Date(
                                    prog.dateString
                                  );
                                  const [ph, pm] = shift.pickupTime.split(":").map(Number);
                                  const shiftStart = new Date(pDate);
                                  shiftStart.setHours(ph, pm, 0, 0);
                                  const rest = calculateRestHours(
                                    st.id,
                                    shiftStart
                                  );
                                  const daysWorked = getStaffWorkload(
                                    st.id
                                  );
                                  const colorClass = getStaffColor(
                                    st,
                                    daysWorked,
                                    rest
                                  );
                                  let target = 5;
                                  if (st.type === "Roster") {
                                    const progStart = new Date(
                                      startDate
                                    );
                                    const progEnd = new Date(endDate);
                                    const workFrom = st.workFromDate ? new Date(st.workFromDate) : progStart;
                                    const workTo = st.workToDate ? new Date(st.workToDate) : progEnd;
                                    const overlapStart = workFrom > progStart ? workFrom : progStart;
                                    const overlapEnd = workTo < progEnd ? workTo : progEnd;
                                    if (overlapStart <= overlapEnd) {
                                      target = Math.floor(
                                        (overlapEnd.getTime() - overlapStart.getTime()) / (1e3 * 60 * 60 * 24)
                                      ) + 1;
                                    } else {
                                      target = 0;
                                    }
                                  }
                                  const showDays = daysWorked !== target;
                                  const isLastShiftOfDay = !shiftsToday.slice(idx + 1).some(
                                    (futureShift) => prog.assignments.some(
                                      (ass) => ass.shiftId === futureShift.id && ass.staffId === st.id
                                    )
                                  );
                                  let nextDayShiftTime = null;
                                  const nextProg = activePrograms[i + 1];
                                  if (isLastShiftOfDay && nextProg) {
                                    const shiftsTomorrow = shifts.filter(
                                      (s) => s.pickupDate === nextProg.dateString
                                    ).sort(
                                      (a2, b) => a2.pickupTime.localeCompare(
                                        b.pickupTime
                                      )
                                    );
                                    for (const tomorrowShift of shiftsTomorrow) {
                                      const nextAssignment = nextProg.assignments.find(
                                        (ass) => ass.shiftId === tomorrowShift.id && ass.staffId === st.id
                                      );
                                      if (nextAssignment) {
                                        try {
                                          const currentEnd = /* @__PURE__ */ new Date(
                                            `${shift.endDate || prog.dateString}T${shift.endTime}:00`
                                          );
                                          const nextStart = /* @__PURE__ */ new Date(
                                            `${tomorrowShift.pickupDate || nextProg.dateString}T${tomorrowShift.pickupTime}:00`
                                          );
                                          const diffHours = (nextStart.getTime() - currentEnd.getTime()) / (1e3 * 60 * 60);
                                          if (diffHours < 12) {
                                            nextDayShiftTime = tomorrowShift.pickupTime;
                                          }
                                        } catch (e) {
                                          nextDayShiftTime = tomorrowShift.pickupTime;
                                        }
                                        break;
                                      }
                                    }
                                  }
                                  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                                    "div",
                                    {
                                      draggable: !(manualAssignments && manualAssignments.some(
                                        (ma) => ma.staffId === st.id && ma.shiftId === shift.id
                                      )),
                                      onDragStart: (e) => {
                                        if (manualAssignments && manualAssignments.some(
                                          (ma) => ma.staffId === st.id && ma.shiftId === shift.id
                                        )) {
                                          e.preventDefault();
                                          return;
                                        }
                                        handleDragStart(
                                          e,
                                          st.id,
                                          shift.id,
                                          prog.dateString,
                                          a.role
                                        );
                                      },
                                      onClick: (e) => {
                                        if (manualAssignments && manualAssignments.some(
                                          (ma) => ma.staffId === st.id && ma.shiftId === shift.id
                                        )) return;
                                        handleStaffItemTap(e, st.id, shift.id, prog.dateString, a.role);
                                      },
                                      className: `px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase transition-all flex items-center gap-1 group ${colorClass} ${staffActionModal?.staffId === st.id && staffActionModal?.currentShiftId === shift.id && staffActionModal?.date === prog.dateString ? "ring-2 ring-offset-1 ring-indigo-600 scale-105" : ""} ${manualAssignments && manualAssignments.some((ma) => ma.staffId === st.id && ma.shiftId === shift.id) ? "opacity-80 cursor-not-allowed border-indigo-200" : "cursor-move hover:scale-105"}`,
                                      children: [
                                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: st.initials }),
                                        manualAssignments && manualAssignments.some(
                                          (ma) => ma.staffId === st.id && ma.shiftId === shift.id
                                        ) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                          import_lucide_react.Lock,
                                          {
                                            size: 8,
                                            className: "text-slate-500 opacity-70 -ml-0.5"
                                          }
                                        ) : null,
                                        rest !== null && rest < minRestHours && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "ml-1 px-1 bg-white text-orange-600 rounded text-[8px]", children: [
                                          rest,
                                          "H"
                                        ] }),
                                        showDays && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ml-1 px-1 bg-black/20 rounded text-[8px]", children: daysWorked }),
                                        nextDayShiftTime && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "ml-1 px-1 bg-slate-400 text-white rounded text-[8px] font-mono", children: [
                                          "\u2192 ",
                                          nextDayShiftTime
                                        ] })
                                      ]
                                    },
                                    a.id
                                  );
                                }),
                                assignments.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-[10px] italic text-slate-300", children: "Drag staff here..." })
                              ] }),
                              Object.entries(
                                shift.roleCounts || {}
                              ).filter(([_, count]) => count > 0).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex flex-wrap gap-1 border-t border-slate-100 pt-2 mt-1", children: Object.entries(
                                shift.roleCounts || {}
                              ).filter(([_, count]) => count > 0).map(([role, count]) => {
                                let roleKey = role;
                                if (role === "Load Control")
                                  roleKey = "LC";
                                if (role === "Shift Leader")
                                  roleKey = "SL";
                                if (role === "Ramp")
                                  roleKey = "RMP";
                                if (role === "Operations")
                                  roleKey = "OPS";
                                if (role === "Lost and Found")
                                  roleKey = "LF";
                                if (role === "Labour")
                                  roleKey = "LBR";
                                if (role === "Security")
                                  roleKey = "SEC";
                                if (role === "Driver")
                                  roleKey = "DRV";
                                const fulfilledCount = assignments.filter((a) => {
                                  const st = getStaff(
                                    a.staffId
                                  );
                                  if (!st) return false;
                                  if (a.role === roleKey || a.role === role)
                                    return true;
                                  if (roleKey === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ"))
                                    return true;
                                  if (roleKey === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ"))
                                    return true;
                                  if (roleKey === "RMP" && st.isRamp)
                                    return true;
                                  if (roleKey === "OPS" && st.isOps)
                                    return true;
                                  if (roleKey === "LF" && st.isLostFound)
                                    return true;
                                  if ((roleKey === "LBR" || roleKey === "Labour") && st.isLabour)
                                    return true;
                                  if ((roleKey === "SEC" || roleKey === "Security") && st.isSecurity)
                                    return true;
                                  if ((roleKey === "DRV" || roleKey === "Driver") && st.isDriver)
                                    return true;
                                  return false;
                                }).length;
                                const isFulfilled = fulfilledCount >= count;
                                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                                  "span",
                                  {
                                    className: `text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${isFulfilled ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`,
                                    children: [
                                      roleKey,
                                      " ",
                                      isFulfilled ? "\u2705" : "\u274C"
                                    ]
                                  },
                                  roleKey
                                );
                              }) }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-1 flex flex-col gap-1", children: [
                                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                                  "button",
                                  {
                                    onClick: () => setNoteModal({ dateString: prog.dateString, shiftId: shift.id, currentNote: prog.notes?.[shift.id] || "" }),
                                    className: "w-full flex items-center justify-center gap-1.5 text-[10px] p-1.5 bg-slate-50 border border-slate-200 border-dashed rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors font-semibold",
                                    children: [
                                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.MessageSquare, { size: 12 }),
                                      prog.notes?.[shift.id] ? "Edit Note" : "Add Note"
                                    ]
                                  }
                                ),
                                prog.notes?.[shift.id] && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-[10px] text-red-600 font-bold p-1.5 bg-red-50 border border-red-100 rounded break-words whitespace-pre-wrap", children: [
                                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Note: " }),
                                  " ",
                                  prog.notes[shift.id]
                                ] })
                              ] })
                            ] }) })
                          ]
                        },
                        shift.id
                      );
                    }
                  ) })
                ] }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "div",
                  {
                    className: `border-t-4 border-slate-100 transition-colors ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-slate-50" : ""}`,
                    onDragOver: handleDragOver,
                    onDrop: (e) => handleDrop(e, "ABSENCE", prog.dateString),
                    onClick: (e) => {
                      e.stopPropagation();
                      handleTargetContainerTap("ABSENCE", prog.dateString);
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "px-6 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2", children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-xs font-black uppercase text-slate-500 tracking-widest", children: "Absence and Rest Registry" }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              onClick: (e) => {
                                e.stopPropagation();
                                setUnlockAbsences(!unlockAbsences);
                              },
                              className: `p-1 rounded ${unlockAbsences ? "bg-rose-100 text-rose-600" : "bg-slate-200 text-slate-500"} hover:opacity-80 transition-all`,
                              title: unlockAbsences ? "Lock absences" : "Unlock absences to reassign",
                              children: unlockAbsences ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Unlock, { size: 12 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Lock, { size: 12 })
                            }
                          )
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-[9px] font-bold text-slate-400 italic", children: "Drag or tap here to unassign" })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "w-full text-left border-collapse", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { className: "bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2 w-48", children: "Status Category" }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "px-4 py-2", children: "Personnel Initials" })
                        ] }) }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { className: "text-[10px] font-medium text-slate-600 divide-y divide-slate-100", children: Object.entries(categories).map(([cat, items]) => {
                          const curCatIds = items.map((i2) => i2.staff.id).sort().join(",");
                          const refCatIds = (refCategories[cat] || []).sort().join(",");
                          const isCatModified = curCatIds !== refCatIds;
                          const sortedItems = [...items].sort((a, b) => {
                            const stA = a.staff;
                            const stB = b.staff;
                            if (!stA && !stB) return 0;
                            if (!stA) return 1;
                            if (!stB) return -1;
                            const getGroupRank = (st) => {
                              if (st.isLabour) return 3;
                              if (st.isSecurity) return 2;
                              return 1;
                            };
                            const rankA = getGroupRank(stA);
                            const rankB = getGroupRank(stB);
                            if (rankA !== rankB) {
                              return rankA - rankB;
                            }
                            return (stA.initials || "").localeCompare(stB.initials || "");
                          });
                          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                            "tr",
                            {
                              onDragOver: (e) => {
                                e.preventDefault();
                              },
                              onDrop: (e) => {
                                e.stopPropagation();
                                handleDrop(e, `ABSENCE_${cat}`, prog.dateString);
                              },
                              onClick: (e) => {
                                e.stopPropagation();
                                handleTargetContainerTap(`ABSENCE_${cat}`, prog.dateString);
                              },
                              className: `transition-colors ${isCatModified ? "bg-indigo-50/70 border-l-4 border-indigo-400" : ""} ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-indigo-50" : ""}`,
                              children: [
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3 font-bold align-top", children: cat }),
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "px-4 py-3", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex flex-col gap-2", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-wrap items-center gap-1.5", children: [
                                  sortedItems.map((item, idx) => {
                                    const {
                                      staff: s,
                                      count,
                                      isRequestedDayOff
                                    } = item;
                                    const daysWorked = getStaffWorkload(
                                      s.id
                                    );
                                    const colorClass = getStaffColor(
                                      s,
                                      daysWorked,
                                      null
                                    );
                                    const isLocked = !unlockAbsences && item.isLeave;
                                    const _dummy = !unlockAbsences && (cat === "ROSTER LEAVE" || cat === "ANNUAL LEAVE" || isRequestedDayOff);
                                    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.default.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                                      "div",
                                      {
                                        draggable: !isLocked,
                                        onDragStart: (e) => {
                                          if (isLocked) {
                                            e.preventDefault();
                                            return;
                                          }
                                          handleDragStart(
                                            e,
                                            s.id,
                                            `ABSENCE_${cat}`,
                                            prog.dateString,
                                            s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ" ? "SL" : s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ" ? "LC" : s.isRamp ? "RMP" : s.isLostFound ? "LF" : s.isLabour ? "LBR" : s.isSecurity ? "SEC" : s.isDriver ? "DRV" : "OPS"
                                          );
                                        },
                                        onClick: (e) => {
                                          if (isLocked) return;
                                          handleStaffItemTap(
                                            e,
                                            s.id,
                                            `ABSENCE_${cat}`,
                                            prog.dateString,
                                            s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ" ? "SL" : s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ" ? "LC" : s.isRamp ? "RMP" : s.isLostFound ? "LF" : s.isLabour ? "LBR" : s.isSecurity ? "SEC" : s.isDriver ? "DRV" : "OPS"
                                          );
                                        },
                                        className: `px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase transition-all flex items-center gap-1 group ${colorClass} ${staffActionModal?.staffId === s.id && staffActionModal?.currentShiftId === "ABSENCE_" + cat && staffActionModal?.date === prog.dateString ? "ring-2 ring-offset-1 ring-indigo-600 scale-105" : ""} ${isLocked ? "opacity-80 cursor-not-allowed border-slate-200 text-slate-500" : "cursor-move hover:scale-105"}`,
                                        children: [
                                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: s.initials }),
                                          isLocked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                            import_lucide_react.Lock,
                                            {
                                              size: 8,
                                              className: "opacity-70 ml-0.5"
                                            }
                                          ) : null
                                        ]
                                      }
                                    ) }, s.id);
                                  }),
                                  items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-[10px] text-slate-300 italic", children: "None" })
                                ] }) }) })
                              ]
                            },
                            cat
                          );
                        }) })
                      ] })
                    ]
                  }
                )
              ]
            },
            i
          );
        })
      ] }) }),
      shiftEditModal && (() => {
        const progIdx = programs.findIndex((p) => p.dateString === shiftEditModal.dateString);
        if (progIdx === -1) return null;
        const prog = programs[progIdx];
        const shift = shifts.find((s) => s.id === shiftEditModal.shiftId);
        if (!shift) return null;
        const currentAssignments = prog.assignments.filter((a) => a.shiftId === shift.id);
        const nonLabourWorkerCount = currentAssignments.filter((a) => {
          const st = activeStaff.find((s) => s.id === a.staffId);
          return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        const workingIds = new Set(prog.assignments.map((a) => a.staffId));
        const offStaff = activeStaff.filter((s) => !workingIds.has(s.id));
        const addStaff = (staffId) => {
          const newPrograms = [...programs];
          const maxSort = Math.max(0, ...prog.assignments.map((a) => a.manualSortIndex || 0));
          const newProg = { ...newPrograms[progIdx], assignments: [...newPrograms[progIdx].assignments] };
          newProg.assignments.push({
            id: Math.random().toString(36).substr(2, 9),
            staffId,
            shiftId: shift.id,
            flightId: "",
            role: "OPS",
            manualSortIndex: maxSort + 1
          });
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms);
        };
        const removeStaff = (staffId) => {
          const newPrograms = [...programs];
          const newProg = { ...newPrograms[progIdx] };
          newProg.assignments = newProg.assignments.filter(
            (a) => !(a.staffId === staffId && a.shiftId === shift.id)
          );
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms);
        };
        const handleSaveBulkEdit = () => {
          const initialsArray = shiftBulkEditText.split(/[\s,-]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
          const matchedStaffIds = [...new Set(initialsArray.map((initial) => {
            const st = activeStaff.find((s) => s.initials.toUpperCase() === initial);
            return st ? st.id : null;
          }).filter(Boolean))];
          const newPrograms = [...programs];
          const newProg = { ...newPrograms[progIdx], assignments: [...newPrograms[progIdx].assignments] };
          newProg.assignments = newProg.assignments.filter((a) => a.shiftId !== shift.id);
          newProg.assignments = newProg.assignments.filter((a) => !matchedStaffIds.includes(a.staffId));
          const maxSort = Math.max(0, ...newProg.assignments.map((a) => a.manualSortIndex || 0));
          matchedStaffIds.forEach((staffId, i) => {
            newProg.assignments.push({
              id: Math.random().toString(36).substr(2, 9),
              staffId,
              shiftId: shift.id,
              flightId: "",
              role: "OPS",
              manualSortIndex: maxSort + 1 + i
            });
          });
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms);
          setIsShiftBulkEditMode(false);
          setShiftBulkEditText("");
        };
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-indigo-600 p-4 flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "font-black italic uppercase tracking-widest text-white leading-none", children: [
              "Shift at ",
              shift.pickupTime,
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-indigo-200", children: [
                "(",
                nonLabourWorkerCount,
                "/",
                shift.maxStaff,
                ")"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => {
                    if (!isShiftBulkEditMode) {
                      const currentInitials = currentAssignments.map((a) => {
                        const st = activeStaff.find((s) => s.id === a.staffId);
                        return st ? st.initials : "";
                      }).filter(Boolean).join(" - ");
                      setShiftBulkEditText(currentInitials);
                    }
                    setIsShiftBulkEditMode(!isShiftBulkEditMode);
                  },
                  className: `w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isShiftBulkEditMode ? "bg-white text-indigo-600" : "bg-indigo-500 hover:bg-indigo-400 text-white"}`,
                  title: "Bulk Edit Initials",
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Edit3, { size: 14 })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => {
                    setShiftEditModal(null);
                    setIsShiftBulkEditMode(false);
                    setShiftBulkEditText("");
                  },
                  className: "w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors",
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.X, { size: 16 })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "p-4 overflow-y-auto", children: isShiftBulkEditMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col gap-3", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest", children: "Edit Staff Initials" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "text-[10px] text-slate-500 mb-1 leading-tight", children: [
              "Type staff initials separated by spaces, commas, or dashes (e.g. ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "font-mono text-slate-700", children: "mz - MH - mk" }),
              ").",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
              "This will replace the entire shift assignment."
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "textarea",
              {
                value: shiftBulkEditText,
                onChange: (e) => setShiftBulkEditText(e.target.value),
                className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 resize-none h-32 uppercase",
                placeholder: "e.g. mz - MH - mk"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-2 mt-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => setIsShiftBulkEditMode(false),
                  className: "flex-1 p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors",
                  children: "Cancel"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: handleSaveBulkEdit,
                  className: "flex-1 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-indigo-200",
                  children: "Save"
                }
              )
            ] })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest mb-3", children: "Currently Assigned" }),
            currentAssignments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm text-slate-400 italic mb-4", children: "No staff assigned." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "space-y-2 mb-4", children: currentAssignments.map((a) => {
              const st = activeStaff.find((s) => s.id === a.staffId);
              if (!st) return null;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-between bg-slate-50 p-2 rounded-xl", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "font-bold text-sm text-slate-700", children: [
                  st.name,
                  " ",
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-slate-400 text-xs font-mono ml-1", children: [
                    "(",
                    st.initials,
                    ")"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: () => removeStaff(st.id),
                    className: "bg-rose-50 text-rose-500 p-2 rounded-lg hover:bg-rose-500 hover:text-white transition-colors",
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Trash2, { size: 14 })
                  }
                )
              ] }, a.id);
            }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pt-4 border-t border-slate-100", children: "Add Staff" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20",
                onChange: (e) => {
                  if (e.target.value) {
                    addStaff(e.target.value);
                    e.target.value = "";
                  }
                },
                defaultValue: "",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", disabled: true, children: "Select available staff..." }),
                  offStaff.map((st) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: st.id, children: [
                    st.name,
                    " (",
                    st.initials,
                    ")"
                  ] }, st.id))
                ]
              }
            )
          ] }) })
        ] }) });
      })(),
      staffActionModal && (() => {
        const progIdx = programs.findIndex((p) => p.dateString === staffActionModal.date);
        const st = activeStaff.find((s) => s.id === staffActionModal.staffId);
        if (progIdx === -1 || !st) return null;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-indigo-600 p-4 flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "font-black italic uppercase tracking-widest text-white leading-none", children: "Move Staff" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                onClick: () => setStaffActionModal(null),
                className: "w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors",
                children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.X, { size: 16 })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg", children: st.initials }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { className: "font-bold text-slate-800 text-sm", children: st.name }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "text-xs text-slate-500 font-medium", children: [
                  "Current: ",
                  staffActionModal.currentShiftId.startsWith("ABSENCE_") ? staffActionModal.currentShiftId.replace("ABSENCE_", "") : shifts.find((s) => s.id === staffActionModal.currentShiftId)?.pickupTime ? `Shift at ${shifts.find((s) => s.id === staffActionModal.currentShiftId)?.pickupTime}` : staffActionModal.currentShiftId
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block", children: "Move To" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 mb-4",
                onChange: (e) => {
                  executeMove(
                    staffActionModal.staffId,
                    staffActionModal.currentShiftId,
                    staffActionModal.date,
                    staffActionModal.role,
                    e.target.value,
                    staffActionModal.date
                  );
                  setStaffActionModal(null);
                },
                defaultValue: "",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", disabled: true, children: "Select destination..." }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", { label: "Shifts", children: shifts.filter((s) => s.pickupDate === staffActionModal.date).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime)).map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: s.id, disabled: s.id === staffActionModal.currentShiftId, children: [
                    "Shift at ",
                    s.pickupTime
                  ] }, s.id)) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("optgroup", { label: "Absences", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "ABSENCE_ANNUAL LEAVE", disabled: staffActionModal.currentShiftId === "ABSENCE_ANNUAL LEAVE", children: "Annual Leave" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "ABSENCE_SICK LEAVE", disabled: staffActionModal.currentShiftId === "ABSENCE_SICK LEAVE", children: "Sick Leave" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "ABSENCE_ROSTER LEAVE", disabled: staffActionModal.currentShiftId === "ABSENCE_ROSTER LEAVE" || st.type === "Local", children: "Roster Leave" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "ABSENCE_STANDBY (RESERVE)", disabled: staffActionModal.currentShiftId === "ABSENCE_STANDBY (RESERVE)", children: "Standby (Reserve)" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", { label: "Action", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "OFFDUTY", disabled: staffActionModal.currentShiftId === "OFFDUTY", children: "Remove from Shift / Send Off-Duty" }) })
                ]
              }
            )
          ] })
        ] }) });
      })(),
      noteModal && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "bg-indigo-600 p-4 flex items-center justify-between", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { className: "font-black italic uppercase tracking-widest text-white leading-none flex items-center gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.MessageSquare, { size: 16 }),
          "Shift Note"
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "p-5", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            autoFocus: true,
            className: "w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 placeholder:text-slate-300 transition-all resize-none h-32",
            placeholder: "Enter shift note here...",
            value: noteModal.currentNote,
            onChange: (e) => setNoteModal({ ...noteModal, currentNote: e.target.value })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              onClick: () => setNoteModal(null),
              className: "px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold transition-colors text-sm",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              onClick: () => {
                handleUpdateNote(noteModal.dateString, noteModal.shiftId, noteModal.currentNote);
                setNoteModal(null);
              },
              className: "px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest italic transition-colors text-sm",
              children: "Save Note"
            }
          )
        ] })
      ] }) })
    ] });
  };
})();
