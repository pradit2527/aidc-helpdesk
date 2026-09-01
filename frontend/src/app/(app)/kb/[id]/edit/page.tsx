'use client';

import { notFound } from 'next/navigation';
import * as React from 'react';

import { ArticleEditor } from '@/components/kb/article-editor';
import { KB_ARTICLES } from '@/mocks/data';

export default function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = React.use(params);
  const article = KB_ARTICLES.find((a) => a.id === Number(id));
  if (!article) notFound();

  return <ArticleEditor article={article} />;
}
