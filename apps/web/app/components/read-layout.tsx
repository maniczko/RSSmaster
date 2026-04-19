import type { ReactNode } from "react";

export type ReadLayoutProps = {
  rail: ReactNode;
  list: ReactNode;
  reader?: ReactNode;
  inspector?: ReactNode;
};

export function ReadLayout({ rail, list, reader, inspector }: ReadLayoutProps) {
  return (
    <div className={`read-layout ${inspector ? "read-layout-with-inspector" : ""}`}>
      <aside className="read-layout-rail">{rail}</aside>
      <section className="read-layout-list">{list}</section>
      {reader ? <section className="read-layout-reader">{reader}</section> : null}
      {inspector ? <aside className="read-layout-inspector">{inspector}</aside> : null}
    </div>
  );
}
