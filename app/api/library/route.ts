import { libraryStats } from "@/lib/server/catalog";
export async function GET(){return Response.json({...libraryStats,candidateLimit:200},{headers:{"Cache-Control":"public, max-age=300"}});}
