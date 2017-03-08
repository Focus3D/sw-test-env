'use strict';

const fetch = require('node-fetch');

module.exports = class Cache {
  /**
   * Constructor
   * @param {String} name
   */
  constructor (name) {
    this.name = name;
    this.items = new Map();
  }

  /**
   * Retrieve 'response' for matching 'request'
   * @param {Request} request
   * @param {Object} [options]
   *  - {Boolean} ignoreSearch
   *  - {Boolean} ignoreMethod
   *  - {Boolean} ignoreVary
   * @returns {Promise<Response>}
   */
  match (request, options) {
    const results = this._match(request, options);

    return Promise.resolve(results.length ? results[0] : undefined);
  }

  /**
   * Retrieve one or more 'response's for matching 'request'
   * @param {Request} request
   * @param {Object} [options]
   *  - {Boolean} ignoreSearch
   *  - {Boolean} ignoreMethod
   *  - {Boolean} ignoreVary
   * @returns {Promise<Array>}
   */
  matchAll (request, options) {
    return Promise.resolve(this._match(request, options));
  }

  /**
   * Fetch and store a 'request'
   * @param {Request|String} request
   * @returns {Promise<void>}
   */
  add (request) {
    const url = ('string' == typeof request)
      ? request
      : request.url;

    return fetch(url)
      .then((response) => {
        if (!response.ok) throw TypeError('bad response status');
        return this.put(url, response);
      });
  }

  /**
   * Fetch and store one or more 'request's
   * @param {Array} requests
   * @returns {Promise<Array>}
   */
  addAll (requests) {
    return Promise.all(requests.map((request) => this.add(request)));
  }

  /**
   * Store 'response' keyed by 'request'
   * @param {Request} request
   * @param {Response} response
   * @returns {Promise<void>}
   */
  put (request, response) {
    // Allow duplicates if different VARY headers
    const existing = this._match(request, { ignoreVary: true })[0];

    if (existing) request = existing[0];
    this.items.set(request, response);
    return Promise.resolve();
  }

  /**
   * Remove 'response' matching 'request'
   * @param {Request} request
   * @param {Object} [options]
   *  - {Boolean} ignoreSearch
   *  - {Boolean} ignoreMethod
   *  - {Boolean} ignoreVary
   * @returns {Promise<Boolean>}
   */
  delete (request, options) {
    return Promise.resolve(true);
  }

  /**
   * Retrieve all keys
   * @param {Request} [request]
   * @param {Object} [options]
   *  - {Boolean} ignoreSearch
   *  - {Boolean} ignoreMethod
   *  - {Boolean} ignoreVary
   * @returns {Promise<Array>}
   */
  keys (request, options) {
    return Promise.resolve([]);
  }

  _match (request, { ignoreSearch = false, ignoreMethod = false, ignoreVary = false }) {
    let { headers, method, url } = request;
    let results = [];

    if (ignoreSearch) url = url.split('?')[0];
    if (ignoreMethod) method = '';
    // TODO: handle VARY header

    this.items.forEach((res, req) => {
      const u = ignoreSearch ? req.url.split('?')[0] : req.url;
      const m = ignoreMethod ? '' : req.method;

      if (u == url && m == method) results.push([req, res]);
    });

    return results;
  }

  _destroy () {
    this.items.clear();
  }
};