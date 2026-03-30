declare module 'next/script' {
  import type { ScriptHTMLAttributes, ReactNode } from 'react';
  
  export interface ScriptProps extends ScriptHTMLAttributes<HTMLScriptElement> {
    strategy?: 'afterInteractive' | 'beforeInteractive' | 'lazyOnload' | 'worker';
    id?: string;
    onLoad?: (e: unknown) => void;
    onReady?: () => void;
    onError?: (e: unknown) => void;
    children?: ReactNode;
  }
  
  const Script: (props: ScriptProps) => JSX.Element;
  export default Script;
}

declare module 'next/server' {
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }

  export interface NextRequest extends Request {
    nextUrl: URL & {
      port: string;
      search: string;
    };
  }
}

declare module "*.css" {}
