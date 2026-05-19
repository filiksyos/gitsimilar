import { notFound } from "next/navigation";
import { SimilarHome } from "@/components/SimilarHome";
import { isValidGitHubRepoPath, normalizeRepoSegment } from "@/lib/parse-repo";

type PageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

export default async function RepoPage({ params }: PageProps) {
  const { owner: ownerRaw, repo: repoRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw);

  if (!isValidGitHubRepoPath(owner, repo)) {
    notFound();
  }

  const repoNorm = normalizeRepoSegment(repo);
  const initialRepo = `${owner}/${repoNorm}`;

  return <SimilarHome initialRepo={initialRepo} autoSubmit />;
}
