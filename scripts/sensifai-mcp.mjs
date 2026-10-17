#!/usr/bin/env node

/**
 * Sensifai MCP Client via SSE for Marketplace Automation
 */

import "./patch-dns.mjs";
import fs from "node:fs";
import path from "node:path";

const MCP_ENDPOINT = process.env.SENSIFAI_MCP_ENDPOINT || "https://sensifai.com/api/mcp/sse";

export class SensifaiMcpClient {
  constructor(endpoint = MCP_ENDPOINT) {
    this.endpoint = endpoint;
    this.postUrl = null;
    this.controller = new AbortController();
    this.requestId = 1;
    this.pending = new Map();
    this.tools = [];
  }

  async connect() {
    const sseRes = await fetch(this.endpoint, {
      signal: this.controller.signal,
      headers: {
        Accept: "text/event-stream",
        "User-Agent": "Mozilla/5.0 (compatible; SensifaiAgent/1.0; +https://sensifai.com)",
      },
    });

    if (!sseRes.ok) {
      throw new Error(`Failed to connect to SSE endpoint: ${sseRes.statusText}`);
    }

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const readLoop = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data.startsWith("http")) {
                this.postUrl = data;
              } else {
                try {
                  const msg = JSON.parse(data);
                  if (msg.id !== undefined && this.pending.has(msg.id)) {
                    const { resolve, reject } = this.pending.get(msg.id);
                    this.pending.delete(msg.id);
                    if (msg.error) {
                      reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                    } else {
                      resolve(msg.result);
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("SSE stream error:", e);
        }
      }
    };
    readLoop();

    for (let i = 0; i < 40; i++) {
      if (this.postUrl) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!this.postUrl) throw new Error("Timed out waiting for MCP SSE post endpoint");

    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "sensifai-marketplace-agent", version: "1.0.0" },
    });

    await fetch(this.postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; SensifaiAgent/1.0; +https://sensifai.com)",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });

    const toolsResult = await this.sendRequest("tools/list", {});
    this.tools = toolsResult.tools || [];
    return this.tools;
  }

  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} (${id}) timed out`));
      }, 30000);

      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });

    const res = await fetch(this.postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; SensifaiAgent/1.0; +https://sensifai.com)",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    if (!res.ok) {
      this.pending.delete(id);
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return promise;
  }

  async callTool(name, args = {}) {
    return await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });
  }

  close() {
    this.controller.abort();
  }
}
