import { afterEach, describe, expect, it, vi } from "vitest";
import {
    handleChatCompletionLocal,
    handleSimpleTextLocal,
} from "../../src/text/handler.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

function createTextContext() {
    const request = new Request(
        "https://gen.pollinations.ai/v1/chat/completions",
    );
    return {
        env: {},
        req: {
            url: request.url,
            path: "/v1/chat/completions",
            method: "POST",
            raw: request,
            param: () => ({}),
            header: (name: string) => request.headers.get(name) ?? undefined,
        },
        var: {
            auth: {
                apiKey: { rawKey: "sk_real_123456789" },
                user: { id: "user-1", tier: "seed" },
            },
        },
    } as never;
}

describe("text handler redaction", () => {
    it("redacts secrets from OpenAI-compatible JSON responses", async () => {
        vi.stubGlobal("fetch", async () => {
            return {
                ok: true,
                json: async () => ({
                    model: "openai",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "use sk_live_abcdefghi",
                            },
                            finish_reason: "stop",
                        },
                    ],
                }),
                headers: new Headers({ "content-type": "application/json" }),
            } as Response;
        });

        const response = await handleChatCompletionLocal(createTextContext(), {
            model: "openai",
            messages: [{ role: "user", content: "hello" }],
        });

        const text = await response.text();
        expect(text).toContain("{SECRET_KEY}");
        expect(text).not.toContain("sk_live_abcdefghi");
    });

    it("redacts secrets from streamed text responses", async () => {
        const encoder = new TextEncoder();

        vi.stubGlobal("fetch", async () => {
            return {
                ok: true,
                body: new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(encoder.encode("data: Bear"));
                        controller.enqueue(encoder.encode("er sk_live_abc"));
                        controller.enqueue(encoder.encode("defghi\n\n"));
                        controller.close();
                    },
                }),
                headers: new Headers({ "content-type": "text/event-stream" }),
            } as unknown as Response;
        });

        const response = await handleSimpleTextLocal(createTextContext(), {
            model: "openai",
            stream: true,
            messages: [{ role: "user", content: "hello" }],
        });

        const text = await response.text();
        expect(text).toContain("Bearer {BEARER_TOKEN}");
        expect(text).not.toContain("sk_live_abcdefghi");
    });
});
