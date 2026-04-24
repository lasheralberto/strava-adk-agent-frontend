export type A2uiTextComponent = {
  Text: {
    usageHint?: 'h1' | 'h2' | 'h3' | 'body' | 'caption'
    text: { literalString: string }
  }
}

export type A2uiColumnComponent = {
  Column: {
    children: { explicitList: string[] }
  }
}

export type A2uiRowComponent = {
  Row: {
    children: { explicitList: string[] }
  }
}

export type A2uiCardComponent = {
  Card: {
    child: string
  }
}

export type A2uiStatCardComponent = {
  StatCard: {
    label: string
    value: string
    detail?: string
  }
}

export type A2uiDividerComponent = {
  Divider: Record<string, never>
}

export type A2uiComponentDef =
  | A2uiTextComponent
  | A2uiColumnComponent
  | A2uiRowComponent
  | A2uiCardComponent
  | A2uiStatCardComponent
  | A2uiDividerComponent

export type A2uiComponentEntry = {
  id: string
  component: A2uiComponentDef
}

export type A2uiBeginRendering = {
  beginRendering: {
    surfaceId: string
    root: string
    styles?: Record<string, string>
  }
}

export type A2uiSurfaceUpdate = {
  surfaceUpdate: {
    surfaceId: string
    components: A2uiComponentEntry[]
  }
}

export type A2uiMessage = A2uiBeginRendering | A2uiSurfaceUpdate

export type A2uiPayload = {
  version: string
  source: 'model' | 'fallback'
  messages: A2uiMessage[]
}
