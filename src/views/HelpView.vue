<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import MarkdownItGitHubAlerts from 'markdown-it-github-alerts'
import { UI } from '../constants/ui'

const helpImages = import.meta.glob('../help/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const imgMap: Record<string, string> = {}
for (const [path, url] of Object.entries(helpImages)) {
  const filename = path.replace(/^.*[/\\]/, '')
  imgMap[filename] = url as string
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const md = new MarkdownIt()
md.use(MarkdownItGitHubAlerts)

const defaultImageRenderer = md.renderer.rules.image

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src') ?? ''
  const resolved = imgMap[src] ?? src
  token.attrSet('src', resolved)
  return defaultImageRenderer!(tokens, idx, options, env, self)
}

md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  const nextIdx = idx + 1
  if (nextIdx < tokens.length && tokens[nextIdx].type === 'inline' && tokens[nextIdx].content) {
    const id = slugify(tokens[nextIdx].content)
    token.attrSet('id', id)
  }
  return self.renderToken(tokens, idx, options)
}

const route = useRoute()
const router = useRouter()

const helpModules = import.meta.glob('../help/*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
})

const topic = computed(() => (route.params.topic as string) || 'index')
const content = ref('')
const notFound = ref(false)
const isLoading = ref(true)

async function loadHelp(topic: string) {
  isLoading.value = true
  notFound.value = false

  const path = `../help/${topic}.md`
  const loader = helpModules[path]

  if (!loader) {
    notFound.value = true
    isLoading.value = false
    return
  }

  try {
    const raw = String(await loader())
    content.value = md.render(raw)
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
}

function handleClick(e: MouseEvent) {
  const link = (e.target as HTMLElement).closest('a')
  if (!link) return

  const href = link.getAttribute('href')
  if (!href) return

  if (href.startsWith('/help')) {
    e.preventDefault()
    router.push(href)
    return
  }

  if (href.startsWith('#')) {
    e.preventDefault()
    const el = document.getElementById(href.slice(1))
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }
}

watch(topic, (newTopic) => loadHelp(newTopic), { immediate: true })
</script>

<template>
  <div class="help-container" @click="handleClick">
    <a
      v-if="topic !== 'index'"
      class="help-back-link"
      @click.prevent="router.push('/help')"
    >← {{ UI.helpBackToOverview }}</a>

    <div v-if="isLoading" class="help-loading">{{ UI.loading }}</div>

    <div v-else-if="notFound" class="help-not-found">
      <h2>{{ UI.helpNotFoundTitle }}</h2>
      <p>{{ UI.helpNotFoundText }}</p>
      <router-link to="/help">{{ UI.helpBackToOverview }}</router-link>
    </div>

    <div
      v-else
      class="help-content"
      v-html="content"
    />
  </div>
</template>

<style scoped>
.help-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  font-family: sans-serif;
  line-height: 1.7;
  color: #222;
}

.help-back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: #2a4a7a;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: none;
}

.help-back-link:hover {
  text-decoration: underline;
}

.help-loading {
  text-align: center;
  padding: 3rem 0;
  color: #666;
}

.help-not-found {
  text-align: center;
  padding: 3rem 0;
}

.help-not-found h2 {
  margin-bottom: 0.5rem;
}

.help-content {
  overflow-wrap: break-word;
}

:deep(h1) {
  font-size: 1.8rem;
  border-bottom: 2px solid #2a4a7a;
  padding-bottom: 0.3rem;
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #1a1a1a;
}

:deep(h2) {
  font-size: 1.4rem;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  color: #2a4a7a;
}

:deep(h3) {
  font-size: 1.15rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  color: #333;
}

:deep(p) {
  margin-bottom: 1rem;
}

:deep(ul),
:deep(ol) {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

:deep(li) {
  margin-bottom: 0.3rem;
}

:deep(a) {
  color: #2a4a7a;
}

:deep(a:hover) {
  text-decoration: underline;
}

:deep(code) {
  background: #f0f0f0;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.875em;
}

:deep(pre) {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.875em;
  line-height: 1.5;
}

:deep(hr) {
  border: none;
  border-top: 1px solid #ddd;
  margin: 2rem 0;
}

:deep(strong) {
  color: #1a1a1a;
}

:deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
}

:deep(th),
:deep(td) {
  border: 1px solid #ddd;
  padding: 0.5rem 0.75rem;
  text-align: left;
}

:deep(th) {
  background: #f0f4fa;
  font-weight: 600;
}

:deep(img) {
  max-width: 100%;
  height: auto;
}
</style>

<style>
@import 'markdown-it-github-alerts/styles/github-base.css';
@import 'markdown-it-github-alerts/styles/github-colors-light.css';

.markdown-alert {
  background: #f8f8f8;
}
</style>
