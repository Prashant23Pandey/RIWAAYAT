import { notFound } from "next/navigation";
import MagViewer from "@/components/viewer/MagViewer";
import { TOTAL_PAGES } from "@/lib/pages-meta";

export function generateStaticParams() {
  return Array.from({ length: TOTAL_PAGES }, (_, i) => ({
    page: String(i + 1),
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const n = Number.parseInt(page, 10);
  if (!Number.isFinite(n) || n < 1 || n > TOTAL_PAGES) notFound();
  return <MagViewer initialPage={n} />;
}
