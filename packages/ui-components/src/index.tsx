import type { PropsWithChildren } from 'react';
export function Panel({ title, children }: PropsWithChildren<{ title: string }>) { return <section className="panel"><header className="panel-heading">{title}</header><div className="panel-body">{children}</div></section>; }
