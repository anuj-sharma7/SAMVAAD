import { redirect } from "next/navigation";
import { getActor } from "@/lib/server/context";

export default async function Home() {
  redirect((await getActor()) ? "/dashboard" : "/login");
}
