import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ request, url, cookies }) => {
  if (request.headers.get("origin") !== url.origin) error(403);

  // 利用者が再読み込みしたときだけVercelの版固定を解除する。
  cookies.delete("__vdpl", { path: "/", sameSite: "strict", secure: true });
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
};
