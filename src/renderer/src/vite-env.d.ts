/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

import React from 'react'

declare global {
  namespace JSX {
    interface Element extends React.ReactElement<any, any> {}
    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}

import type { RendererApi } from '@shared/api'

declare global {
  interface Window {
    ccpro: RendererApi
  }
}

export {}
