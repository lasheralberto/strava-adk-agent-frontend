import type { A2uiPayload, A2uiComponentEntry, A2uiComponentDef } from '@/types/a2ui'

type A2uiRendererProps = {
  payload: A2uiPayload
}

export function A2uiRenderer({ payload }: A2uiRendererProps) {
  const { messages } = payload

  const beginMsg = messages.find((m) => 'beginRendering' in m)
  const updateMsg = messages.find((m) => 'surfaceUpdate' in m)

  if (!beginMsg || !('beginRendering' in beginMsg)) return null
  if (!updateMsg || !('surfaceUpdate' in updateMsg)) return null

  const { root: rootId } = beginMsg.beginRendering
  const { components } = updateMsg.surfaceUpdate

  const lookup = new Map<string, A2uiComponentEntry>()
  for (const entry of components) {
    lookup.set(entry.id, entry)
  }

  const rootEntry = lookup.get(rootId)
  if (!rootEntry) return null

  return (
    <div className="a2ui-surface">
      <RenderNode entry={rootEntry} lookup={lookup} />
    </div>
  )
}

function RenderNode({
  entry,
  lookup,
}: {
  entry: A2uiComponentEntry
  lookup: Map<string, A2uiComponentEntry>
}) {
  const def = entry.component
  const type = getComponentType(def)

  switch (type) {
    case 'Column':
      return <ColumnNode def={def} lookup={lookup} />
    case 'Row':
      return <RowNode def={def} lookup={lookup} />
    case 'Card':
      return <CardNode def={def} lookup={lookup} />
    case 'Text':
      return <TextNode def={def} />
    case 'StatCard':
      return <StatCardNode def={def} />
    case 'Divider':
      return <hr className="a2ui-divider" />
    default:
      return null
  }
}

function getComponentType(def: A2uiComponentDef): string {
  return Object.keys(def)[0] ?? ''
}

function resolveChildren(
  childIds: string[],
  lookup: Map<string, A2uiComponentEntry>,
) {
  return childIds
    .map((id) => lookup.get(id))
    .filter((e): e is A2uiComponentEntry => e != null)
}

function ColumnNode({
  def,
  lookup,
}: {
  def: A2uiComponentDef
  lookup: Map<string, A2uiComponentEntry>
}) {
  if (!('Column' in def)) return null
  const children = resolveChildren(def.Column.children.explicitList, lookup)

  return (
    <div className="a2ui-column">
      {children.map((child) => (
        <RenderNode key={child.id} entry={child} lookup={lookup} />
      ))}
    </div>
  )
}

function RowNode({
  def,
  lookup,
}: {
  def: A2uiComponentDef
  lookup: Map<string, A2uiComponentEntry>
}) {
  if (!('Row' in def)) return null
  const children = resolveChildren(def.Row.children.explicitList, lookup)

  return (
    <div className="a2ui-row">
      {children.map((child) => (
        <RenderNode key={child.id} entry={child} lookup={lookup} />
      ))}
    </div>
  )
}

function CardNode({
  def,
  lookup,
}: {
  def: A2uiComponentDef
  lookup: Map<string, A2uiComponentEntry>
}) {
  if (!('Card' in def)) return null
  const childEntry = lookup.get(def.Card.child)

  return (
    <div className="a2ui-card">
      {childEntry ? <RenderNode entry={childEntry} lookup={lookup} /> : null}
    </div>
  )
}

function TextNode({ def }: { def: A2uiComponentDef }) {
  if (!('Text' in def)) return null
  const { usageHint, text } = def.Text
  const content = text.literalString

  switch (usageHint) {
    case 'h1':
      return <h1 className="a2ui-text a2ui-text--h1">{content}</h1>
    case 'h2':
      return <h2 className="a2ui-text a2ui-text--h2">{content}</h2>
    case 'h3':
      return <h3 className="a2ui-text a2ui-text--h3">{content}</h3>
    case 'caption':
      return <p className="a2ui-text a2ui-text--caption">{content}</p>
    default:
      return <p className="a2ui-text a2ui-text--body">{content}</p>
  }
}

function StatCardNode({ def }: { def: A2uiComponentDef }) {
  if (!('StatCard' in def)) return null
  const { label, value, detail } = def.StatCard

  return (
    <div className="a2ui-stat-card">
      <span className="a2ui-stat-label">{label}</span>
      <span className="a2ui-stat-value">{value}</span>
      {detail ? <span className="a2ui-stat-detail">{detail}</span> : null}
    </div>
  )
}
