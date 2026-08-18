import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/client/preview/markdown'

describe('renderMarkdown fenced code blocks', () => {
  it('renders a backtick fence', () => {
    const html = renderMarkdown('```ts\nconst a = 1\n```')
    expect(html).toContain('<pre class="language-ts"><code>const a = 1</code></pre>')
  })

  it('renders a tilde fence', () => {
    const html = renderMarkdown('~~~text\nsrc/novelcanon/\n  config/\n~~~')
    expect(html).toContain('<pre class="language-text"><code>src/novelcanon/\n  config/</code></pre>')
  })

  it('does not treat tilde-fence inner content as strikethrough', () => {
    const html = renderMarkdown('~~~text\n~~ not a del\n~~~')
    expect(html).not.toContain('<del>')
    expect(html).toContain('<code>~~ not a del</code>')
  })

  it('closes a tilde fence only with tildes, not backticks', () => {
    const html = renderMarkdown('~~~text\nline\n```\n~~~')
    expect(html).toContain('<code>line\n```</code>')
  })

  it('keeps real strikethrough working', () => {
    const html = renderMarkdown('~~gone~~ stays')
    expect(html).toContain('<del>gone</del>')
    expect(html).toContain('stays')
  })

  it('does not open strikethrough on a bare triple tilde', () => {
    const html = renderMarkdown('~~~ not a fence inside a paragraph')
    expect(html).not.toContain('<del>')
    expect(html).toContain('~~~ not a fence inside a paragraph')
  })
})
