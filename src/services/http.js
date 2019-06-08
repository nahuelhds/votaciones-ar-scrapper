import { Agent } from "https";
import fetch from "node-fetch";

const METHOD_GET = "GET";
const METHOD_POST = "POST";
const METHOD_PUT = "PUT";
const METHOD_DELETE = "DELETE";

export const req = (method, endpoint, params = null, headers = {}) => {
  const body = params !== null ? JSON.stringify(params) : null;
  const uri = `${process.env.API_URI}/${endpoint}`;
  return fetch(uri, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_TOKEN}`,
      ...headers
    },
    body,
    agent: new Agent({
      rejectUnauthorized: false
    })
  });
};

export const get = (endpoint, params = {}, headers = {}) => {
  return req(METHOD_GET, `${endpoint}/${stringify(params)}`, null, headers);
};
export const post = (endpoint, params, headers) =>
  req(METHOD_POST, endpoint, params, headers);
export const put = (endpoint, params, headers) =>
  req(METHOD_PUT, endpoint, params, headers);
export const del = (endpoint, headers) =>
  req(METHOD_DELETE, endpoint, null, headers);

// Helper para req GET
const stringify = object =>
  Object.keys(object)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(object[key])}`)
    .join("&");

export default {
  get,
  post,
  put,
  del
};
