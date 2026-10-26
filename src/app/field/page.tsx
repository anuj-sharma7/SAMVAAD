import { FieldApp } from "@/components/field/field-app";

export const metadata = { title: "Field mode" };

/**
 * Field mode: the part of SAMVAAD that works without internet. This page is public and contains NO user data (records live in the
 * device database and are read by the browser), which is why the service worker may cache it.
 */
export default function FieldPage() {
  return <FieldApp />;
}
