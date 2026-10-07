import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Modal } from './AppModal';
import { X, Check } from 'lucide-react-native';
import { SproutIcon } from '../learning/LearningIcons';

// ─────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────

export interface RichContentRendererProps {
  content: string | null | undefined;
  baseFontSize?: number;
  textColor?: string;
  accentColor?: string;
  containerStyle?: StyleProp<ViewStyle>;
  showImageZoom?: boolean;
}

interface ParsedNode {
  type: 'text' | 'tag';
  tag?: string;
  attrs?: Record<string, string>;
  children?: ParsedNode[];
  text?: string;
}

interface InlineStyleContext {
  color?: string;
  backgroundColor?: string;
  fontWeight?: TextStyle['fontWeight'];
  fontStyle?: TextStyle['fontStyle'];
  textDecorationLine?: TextStyle['textDecorationLine'];
  fontSize?: number;
  textAlign?: TextStyle['textAlign'];
}

// ─────────────────────────────────────────────────────────────
// HTML Entity Decoder & Content Normalizer
// ─────────────────────────────────────────────────────────────

function decodeHtmlEntities(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/&nbsp;/gi, '\u00A0')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&bull;/gi, '•')
    .replace(/&copy;/gi, '©')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/**
 * Universal content normalizer:
 * Converts EditorJS JSON blocks or plain Markdown into standard HTML for unified rendering.
 */
function normalizeToHtml(content: string | null | undefined): string {
  if (!content) return '';

  const trimmed = content.trim();

  // 1. Handle EditorJS JSON structure: { blocks: [...] }
  if (trimmed.startsWith('{') && trimmed.includes('"blocks"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.blocks)) {
        return parsed.blocks
          .map((block: any) => {
            const data = block.data || {};
            switch (block.type) {
              case 'header':
                return `<h${data.level || 2}>${data.text || ''}</h${data.level || 2}>`;
              case 'paragraph':
                return `<p>${data.text || ''}</p>`;
              case 'list': {
                const tag = data.style === 'ordered' ? 'ol' : 'ul';
                const items = (data.items || []).map((i: string) => `<li>${i}</li>`).join('');
                return `<${tag}>${items}</${tag}>`;
              }
              case 'quote':
                return `<blockquote>${data.text || ''}</blockquote>`;
              case 'image': {
                const src = data.file?.url || data.url || '';
                const caption = data.caption || '';
                return `<figure><img src="${src}" alt="${caption}" /><figcaption>${caption}</figcaption></figure>`;
              }
              default:
                return `<p>${data.text || ''}</p>`;
            }
          })
          .join('');
      }
    } catch {
      // Continue to next checks if JSON parse fails
    }
  }

  // 2. Normalize markdown images: ![alt](url)
  let normalized = trimmed.replace(
    /!\[(.*?)\]\((.*?)\)/g,
    '<figure><img src="$2" alt="$1" /><figcaption>$1</figcaption></figure>'
  );

  // 3. If raw markdown or plain text with no HTML tags, convert to HTML paragraphs/headings
  const hasHtmlTag = /<[a-z][\s\S]*>/i.test(normalized);
  if (!hasHtmlTag) {
    const lines = normalized.split('\n');
    const result: string[] = [];
    let inList = false;
    let listType = 'ul';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        continue;
      }

      if (line.startsWith('# ')) {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        result.push(`<h1>${line.slice(2)}</h1>`);
      } else if (line.startsWith('## ')) {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        result.push(`<h2>${line.slice(3)}</h2>`);
      } else if (line.startsWith('### ')) {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        result.push(`<h3>${line.slice(4)}</h3>`);
      } else if (line.startsWith('> ')) {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        result.push(`<blockquote>${line.slice(2)}</blockquote>`);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push(`</${listType}>`);
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        result.push(`<li>${line.slice(2)}</li>`);
      } else if (/^\d+\.\s+/.test(line)) {
        const itemText = line.replace(/^\d+\.\s+/, '');
        if (!inList || listType !== 'ol') {
          if (inList) result.push(`</${listType}>`);
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push(`<li>${itemText}</li>`);
      } else {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        result.push(`<p>${line}</p>`);
      }
    }

    if (inList) {
      result.push(`</${listType}>`);
    }

    normalized = result.join('');
  }

  // Convert inline markdown bold (**bold**) and italics (*italic*) within paragraphs
  normalized = normalized.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  normalized = normalized.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  return normalized;
}

// ─────────────────────────────────────────────────────────────
// HTML Lexer & Tree Parser
// ─────────────────────────────────────────────────────────────

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!attrStr) return attrs;

  // Regex to extract key="value", key='value', or key=value
  const regex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(attrStr)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }

  return attrs;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input']);

function parseHtmlToAst(html: string): ParsedNode[] {
  const rootNodes: ParsedNode[] = [];
  const stack: { tag: string; children: ParsedNode[] }[] = [{ tag: 'root', children: rootNodes }];

  // Regex matches:
  // 1: Closing tag </tag>
  // 2: Opening tag <tag ...>
  // 3: Text content outside tags
  const tokenRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [, isClosing, tagName, rawAttrs, rawText] = match;
    const current = stack[stack.length - 1];

    if (rawText) {
      const decoded = decodeHtmlEntities(rawText);
      // Preserve text if it has non-whitespace characters or if it's an inline spacer
      if (decoded.length > 0) {
        current.children.push({ type: 'text', text: decoded });
      }
    } else if (isClosing) {
      const closingTag = (tagName || '').toLowerCase();
      // Pop until we find matching tag or stack has 1 element
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === closingTag) {
          while (stack.length > i) {
            stack.pop();
          }
          break;
        }
      }
    } else if (tagName) {
      const tagLower = tagName.toLowerCase();
      const attrs = parseAttributes(rawAttrs || '');

      if (VOID_TAGS.has(tagLower)) {
        current.children.push({
          type: 'tag',
          tag: tagLower,
          attrs,
          children: [],
        });
      } else {
        const node: ParsedNode = {
          type: 'tag',
          tag: tagLower,
          attrs,
          children: [],
        };
        current.children.push(node);
        stack.push({ tag: tagLower, children: node.children! });
      }
    }
  }

  return rootNodes;
}

// ─────────────────────────────────────────────────────────────
// Style Resolvers for Quill & Inline CSS
// ─────────────────────────────────────────────────────────────

function parseCssStyle(styleStr = ''): InlineStyleContext {
  const styleContext: InlineStyleContext = {};
  if (!styleStr) return styleContext;

  const declarations = styleStr.split(';');
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;

    const property = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();

    switch (property) {
      case 'color':
        styleContext.color = value;
        break;
      case 'background-color':
      case 'background':
        styleContext.backgroundColor = value;
        break;
      case 'font-weight':
        if (['bold', '700', '800', '900'].includes(value)) {
          styleContext.fontWeight = '700';
        } else if (['600', '500'].includes(value)) {
          styleContext.fontWeight = '600';
        } else {
          styleContext.fontWeight = 'normal';
        }
        break;
      case 'font-style':
        if (value === 'italic' || value === 'oblique') {
          styleContext.fontStyle = 'italic';
        }
        break;
      case 'text-decoration':
      case 'text-decoration-line':
        if (value.includes('underline') && value.includes('line-through')) {
          styleContext.textDecorationLine = 'underline line-through';
        } else if (value.includes('underline')) {
          styleContext.textDecorationLine = 'underline';
        } else if (value.includes('line-through')) {
          styleContext.textDecorationLine = 'line-through';
        }
        break;
      case 'text-align':
        if (['left', 'center', 'right', 'justify'].includes(value)) {
          styleContext.textAlign = value as TextStyle['textAlign'];
        }
        break;
      case 'font-size': {
        const num = parseFloat(value);
        if (!isNaN(num)) {
          if (value.endsWith('px') || value.endsWith('pt')) {
            styleContext.fontSize = num;
          } else if (value.endsWith('em') || value.endsWith('rem')) {
            styleContext.fontSize = num * 16;
          } else if (value.endsWith('%')) {
            styleContext.fontSize = (num / 100) * 16;
          }
        }
        break;
      }
    }
  }

  return styleContext;
}

function resolveQuillClassStyles(className = '', baseFontSize: number): InlineStyleContext {
  const styleContext: InlineStyleContext = {};
  if (!className) return styleContext;

  const classes = className.split(/\s+/);
  for (const cls of classes) {
    // Text Alignment
    if (cls === 'ql-align-center') styleContext.textAlign = 'center';
    if (cls === 'ql-align-right') styleContext.textAlign = 'right';
    if (cls === 'ql-align-justify') styleContext.textAlign = 'justify';

    // Font Sizes
    if (cls === 'ql-size-small') styleContext.fontSize = baseFontSize * 0.82;
    if (cls === 'ql-size-large') styleContext.fontSize = baseFontSize * 1.25;
    if (cls === 'ql-size-huge') styleContext.fontSize = baseFontSize * 1.55;

    // Common Quill color classes
    if (cls === 'ql-color-red') styleContext.color = '#E11D48';
    if (cls === 'ql-color-orange') styleContext.color = '#EA580C';
    if (cls === 'ql-color-yellow') styleContext.color = '#CA8A04';
    if (cls === 'ql-color-green') styleContext.color = '#16A34A';
    if (cls === 'ql-color-blue') styleContext.color = '#2563EB';
    if (cls === 'ql-color-purple') styleContext.color = '#9333EA';
  }

  return styleContext;
}

// ─────────────────────────────────────────────────────────────
// Interactive Image Figure Component with Fullscreen Zoom
// ─────────────────────────────────────────────────────────────

function AppleImageFigure({ src, alt, showZoom }: { src?: string; alt?: string; showZoom: boolean }) {
  const [imageError, setImageError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  if (!src || imageError) {
    return (
      <View style={styles.imageFallbackContainer}>
        <View style={styles.imageFallbackIcon}>
          <SproutIcon size={24} color="#8C4522" />
        </View>
        <Text style={styles.imageFallbackTitle}>{alt || 'Agricultural Illustration'}</Text>
        <Text style={styles.imageFallbackSubtitle}>SoilSync Knowledge Base</Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={showZoom ? 0.92 : 1}
        onPress={() => showZoom && setIsZoomed(true)}
        disabled={!showZoom}
        style={styles.imageCard}
      >
        <Image
          source={{ uri: src }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
        {alt ? (
          <View style={styles.imageCaptionBar}>
            <Text style={styles.imageCaptionText}>📷 {alt}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Fullscreen Zoom Modal */}
      {showZoom && (
        <Modal
          visible={isZoomed}
          transparent
          animationType="fade"
          onRequestClose={() => setIsZoomed(false)}
        >
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              onPress={() => setIsZoomed(false)}
              activeOpacity={0.8}
              style={styles.modalCloseButton}
            >
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <Image source={{ uri: src }} style={styles.modalImage} resizeMode="contain" />

            {alt ? (
              <View style={styles.modalCaptionBadge}>
                <Text style={styles.modalCaptionText}>{alt}</Text>
              </View>
            ) : null}
          </View>
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Recursive AST Node Renderer
// ─────────────────────────────────────────────────────────────

interface RenderContext {
  baseFontSize: number;
  textColor: string;
  accentColor: string;
  showImageZoom: boolean;
}

function renderInlineChildren(
  nodes: ParsedNode[],
  parentContext: InlineStyleContext,
  ctx: RenderContext
): React.ReactNode {
  return nodes.map((node, index) => {
    if (node.type === 'text') {
      const textStyle: TextStyle = {
        color: parentContext.color || ctx.textColor,
        fontSize: parentContext.fontSize || ctx.baseFontSize,
        fontWeight: parentContext.fontWeight || 'normal',
        fontStyle: parentContext.fontStyle || 'normal',
        textDecorationLine: parentContext.textDecorationLine || 'none',
        backgroundColor: parentContext.backgroundColor || 'transparent',
      };

      return (
        <Text key={`txt-${index}`} style={textStyle}>
          {node.text}
        </Text>
      );
    }

    const tag = node.tag;
    const attrs = node.attrs || {};
    const cssStyle = parseCssStyle(attrs.style);
    const classStyle = resolveQuillClassStyles(attrs.class, ctx.baseFontSize);

    // Merge styles inherited down the tree
    const mergedContext: InlineStyleContext = {
      ...parentContext,
      ...classStyle,
      ...cssStyle,
    };

    if (tag === 'strong' || tag === 'b') {
      mergedContext.fontWeight = '700';
      if (!mergedContext.color) mergedContext.color = '#1E293B';
    }

    if (tag === 'em' || tag === 'i') {
      mergedContext.fontStyle = 'italic';
    }

    if (tag === 'u') {
      mergedContext.textDecorationLine =
        mergedContext.textDecorationLine === 'line-through'
          ? 'underline line-through'
          : 'underline';
    }

    if (tag === 's' || tag === 'strike' || tag === 'del') {
      mergedContext.textDecorationLine =
        mergedContext.textDecorationLine === 'underline'
          ? 'underline line-through'
          : 'line-through';
    }

    if (tag === 'code') {
      return (
        <Text
          key={`code-${index}`}
          style={{
            fontFamily: 'monospace',
            backgroundColor: '#F1EBE4',
            color: '#8C4522',
            fontSize: (mergedContext.fontSize || ctx.baseFontSize) * 0.88,
            fontWeight: '600',
            paddingHorizontal: 4,
            paddingVertical: 1,
            borderRadius: 4,
          }}
        >
          {renderInlineChildren(node.children || [], mergedContext, ctx)}
        </Text>
      );
    }

    if (tag === 'a') {
      const href = attrs.href;
      return (
        <Text
          key={`link-${index}`}
          onPress={() => {
            if (href) {
              Linking.openURL(href).catch((err) =>
                console.warn('[RichContentRenderer] Failed to open link:', err)
              );
            }
          }}
          style={{
            color: '#0284C7',
            fontWeight: '600',
            textDecorationLine: 'underline',
          }}
        >
          {renderInlineChildren(node.children || [], mergedContext, ctx)}
        </Text>
      );
    }

    if (tag === 'br') {
      return '\n';
    }

    return (
      <Text key={`inline-${tag}-${index}`}>
        {renderInlineChildren(node.children || [], mergedContext, ctx)}
      </Text>
    );
  });
}

function renderBlockNodes(
  nodes: ParsedNode[],
  ctx: RenderContext,
  listContext?: { ordered: boolean; itemIndex: number }
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  nodes.forEach((node, index) => {
    if (node.type === 'text') {
      const trimmed = (node.text || '').trim();
      if (!trimmed) return;

      elements.push(
        <Text
          key={`p-text-${index}`}
          style={[
            styles.paragraph,
            { fontSize: ctx.baseFontSize, color: ctx.textColor },
          ]}
        >
          {node.text}
        </Text>
      );
      return;
    }

    const tag = node.tag;
    const attrs = node.attrs || {};
    const children = node.children || [];
    const cssStyle = parseCssStyle(attrs.style);
    const classStyle = resolveQuillClassStyles(attrs.class, ctx.baseFontSize);

    const blockStyleContext: InlineStyleContext = {
      ...classStyle,
      ...cssStyle,
    };

    switch (tag) {
      // ─────────────────────────────────────────────
      // Headings
      // ─────────────────────────────────────────────
      case 'h1': {
        const h1Size = ctx.baseFontSize * 1.55;
        return elements.push(
          <Text
            key={`h1-${index}`}
            style={[
              styles.h1,
              {
                fontSize: h1Size,
                lineHeight: h1Size * 1.35,
                textAlign: blockStyleContext.textAlign || 'left',
                color: blockStyleContext.color || '#1E293B',
              },
            ]}
          >
            {renderInlineChildren(children, { ...blockStyleContext, fontWeight: '800' }, ctx)}
          </Text>
        );
      }

      case 'h2': {
        const h2Size = ctx.baseFontSize * 1.28;
        return elements.push(
          <Text
            key={`h2-${index}`}
            style={[
              styles.h2,
              {
                fontSize: h2Size,
                lineHeight: h2Size * 1.4,
                textAlign: blockStyleContext.textAlign || 'left',
                color: blockStyleContext.color || '#2A1610',
              },
            ]}
          >
            {renderInlineChildren(children, { ...blockStyleContext, fontWeight: '700' }, ctx)}
          </Text>
        );
      }

      case 'h3': {
        const h3Size = ctx.baseFontSize * 1.1;
        return elements.push(
          <Text
            key={`h3-${index}`}
            style={[
              styles.h3,
              {
                fontSize: h3Size,
                lineHeight: h3Size * 1.45,
                textAlign: blockStyleContext.textAlign || 'left',
                color: blockStyleContext.color || '#523625',
              },
            ]}
          >
            {renderInlineChildren(children, { ...blockStyleContext, fontWeight: '700' }, ctx)}
          </Text>
        );
      }

      // ─────────────────────────────────────────────
      // Paragraphs & Text Blocks
      // ─────────────────────────────────────────────
      case 'p': {
        // If image inside paragraph, extract and render as image figure
        const imgChild = children.find((c) => c.tag === 'img');
        if (imgChild) {
          const src = imgChild.attrs?.src || '';
          const alt = imgChild.attrs?.alt || '';
          return elements.push(
            <AppleImageFigure
              key={`fig-p-${index}`}
              src={src}
              alt={alt}
              showZoom={ctx.showImageZoom}
            />
          );
        }

        // Blank paragraph spacer: <p><br></p> or empty <p></p>
        const isBlank =
          children.length === 0 ||
          (children.length === 1 &&
            (children[0].tag === 'br' ||
              (children[0].type === 'text' && !children[0].text?.trim())));

        if (isBlank) {
          return elements.push(<View key={`spacer-${index}`} style={styles.emptyLineSpacer} />);
        }

        return elements.push(
          <Text
            key={`p-${index}`}
            style={[
              styles.paragraph,
              {
                fontSize: blockStyleContext.fontSize || ctx.baseFontSize,
                lineHeight: (blockStyleContext.fontSize || ctx.baseFontSize) * 1.7,
                textAlign: blockStyleContext.textAlign || 'left',
                color: blockStyleContext.color || ctx.textColor,
                backgroundColor: blockStyleContext.backgroundColor || 'transparent',
              },
            ]}
          >
            {renderInlineChildren(children, blockStyleContext, ctx)}
          </Text>
        );
      }

      // ─────────────────────────────────────────────
      // Images & Figures
      // ─────────────────────────────────────────────
      case 'figure': {
        const imgChild = children.find((c) => c.tag === 'img');
        const captionChild = children.find((c) => c.tag === 'figcaption');
        const captionText =
          captionChild?.children?.[0]?.text || node.attrs?.alt || imgChild?.attrs?.alt || '';
        const src = imgChild?.attrs?.src || node.attrs?.src || '';

        return elements.push(
          <AppleImageFigure
            key={`fig-${index}`}
            src={src}
            alt={captionText}
            showZoom={ctx.showImageZoom}
          />
        );
      }

      case 'img': {
        const src = attrs.src || '';
        const alt = attrs.alt || '';
        return elements.push(
          <AppleImageFigure
            key={`img-${index}`}
            src={src}
            alt={alt}
            showZoom={ctx.showImageZoom}
          />
        );
      }

      // ─────────────────────────────────────────────
      // Blockquotes & Callouts
      // ─────────────────────────────────────────────
      case 'blockquote': {
        return elements.push(
          <View key={`quote-${index}`} style={styles.blockquote}>
            <Text
              style={[
                styles.blockquoteText,
                {
                  fontSize: ctx.baseFontSize * 0.95,
                  lineHeight: ctx.baseFontSize * 1.6,
                },
              ]}
            >
              {renderInlineChildren(children, { ...blockStyleContext, fontStyle: 'italic' }, ctx)}
            </Text>
          </View>
        );
      }

      // ─────────────────────────────────────────────
      // Code Blocks (<pre class="ql-syntax">)
      // ─────────────────────────────────────────────
      case 'pre': {
        return elements.push(
          <View key={`pre-${index}`} style={styles.codeBlockCard}>
            <Text style={styles.codeBlockText}>
              {renderInlineChildren(children, { fontStyle: 'normal' }, ctx)}
            </Text>
          </View>
        );
      }

      // ─────────────────────────────────────────────
      // Lists (Ordered, Bullet, & Checklists)
      // ─────────────────────────────────────────────
      case 'ul':
      case 'ol': {
        const isOrdered = tag === 'ol';
        return elements.push(
          <View key={`list-${index}`} style={styles.listContainer}>
            {children.map((child, cIdx) => (
              <React.Fragment key={`li-item-${cIdx}`}>
                {renderBlockNodes([child], ctx, { ordered: isOrdered, itemIndex: cIdx })}
              </React.Fragment>
            ))}
          </View>
        );
      }

      case 'li': {
        const isOrdered = listContext?.ordered ?? false;
        const itemIdx = listContext?.itemIndex ?? 0;
        const dataList = attrs['data-list'];

        // 1. Task / Checklist Item
        if (dataList === 'checked' || dataList === 'unchecked') {
          const isChecked = dataList === 'checked';
          return elements.push(
            <View key={`task-${index}`} style={styles.listItemRow}>
              <View style={styles.checkboxContainer}>
                {isChecked ? (
                  <View style={styles.checkboxChecked}>
                    <Check size={11} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : (
                  <View style={styles.checkboxUnchecked} />
                )}
              </View>
              <Text
                style={[
                  styles.listItemText,
                  {
                    fontSize: ctx.baseFontSize,
                    lineHeight: ctx.baseFontSize * 1.7,
                    color: isChecked ? '#64748B' : ctx.textColor,
                    textDecorationLine: isChecked ? 'line-through' : 'none',
                  },
                ]}
              >
                {renderInlineChildren(children, blockStyleContext, ctx)}
              </Text>
            </View>
          );
        }

        // 2. Standard Bullet or Numbered List Item
        return elements.push(
          <View key={`li-${index}`} style={styles.listItemRow}>
            <View style={styles.listBulletBadge}>
              {isOrdered ? (
                <Text style={styles.listNumberText}>{itemIdx + 1}.</Text>
              ) : (
                <View style={styles.listBulletDot} />
              )}
            </View>
            <Text
              style={[
                styles.listItemText,
                {
                  fontSize: ctx.baseFontSize,
                  lineHeight: ctx.baseFontSize * 1.7,
                  color: ctx.textColor,
                },
              ]}
            >
              {renderInlineChildren(children, blockStyleContext, ctx)}
            </Text>
          </View>
        );
      }

      // ─────────────────────────────────────────────
      // Horizontal Divider
      // ─────────────────────────────────────────────
      case 'hr': {
        return elements.push(<View key={`hr-${index}`} style={styles.divider} />);
      }

      // ─────────────────────────────────────────────
      // Fallback Container (div, section, span, etc.)
      // ─────────────────────────────────────────────
      default: {
        return elements.push(
          <React.Fragment key={`wrap-${index}`}>
            {renderBlockNodes(children, ctx, listContext)}
          </React.Fragment>
        );
      }
    }
  });

  return elements;
}

// ─────────────────────────────────────────────────────────────
// Main Component: RichContentRenderer
// ─────────────────────────────────────────────────────────────

export function RichContentRenderer({
  content,
  baseFontSize = 15,
  textColor = '#334155',
  accentColor = '#8C4522',
  containerStyle,
  showImageZoom = true,
}: RichContentRendererProps) {
  const ast = useMemo(() => {
    if (!content) return [];
    const normalizedHtml = normalizeToHtml(content);
    return parseHtmlToAst(normalizedHtml);
  }, [content]);

  if (!content || ast.length === 0) {
    return null;
  }

  const renderContext: RenderContext = {
    baseFontSize,
    textColor,
    accentColor,
    showImageZoom,
  };

  return <View style={[styles.container, containerStyle]}>{renderBlockNodes(ast, renderContext)}</View>;
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  h1: {
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  h2: {
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 18,
    marginBottom: 8,
  },
  h3: {
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: {
    letterSpacing: -0.1,
    marginBottom: 12,
  },
  emptyLineSpacer: {
    height: 10,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 14,
    borderRadius: 14,
  },
  blockquoteText: {
    color: '#065F46',
    fontWeight: '600',
  },
  codeBlockCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginVertical: 12,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#F8FAFC',
    lineHeight: 20,
  },
  listContainer: {
    marginBottom: 12,
    paddingLeft: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingLeft: 2,
  },
  listBulletBadge: {
    width: 22,
    paddingTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8C4522',
  },
  listNumberText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8C4522',
    lineHeight: 18,
  },
  checkboxContainer: {
    width: 22,
    paddingTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    width: 16,
    height: 16,
    borderRadius: 5,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxUnchecked: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  listItemText: {
    flex: 1,
    letterSpacing: -0.1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 18,
  },
  imageCard: {
    marginVertical: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#F1EBE4',
  },
  imageCaptionBar: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
  },
  imageCaptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#523625',
  },
  imageFallbackContainer: {
    marginVertical: 14,
    borderRadius: 18,
    backgroundColor: '#F8F6F0',
    borderWidth: 1,
    borderColor: 'rgba(140,69,34,0.12)',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(140,69,34,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  imageFallbackTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#523625',
    textAlign: 'center',
  },
  imageFallbackSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8C4522',
    opacity: 0.7,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
  modalCaptionBadge: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  modalCaptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default RichContentRenderer;
