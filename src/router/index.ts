import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/character/new',
      name: 'character-new',
      component: () => import('../views/CharacterEditView.vue'),
    },
    {
      path: '/character/:id',
      name: 'character-sheet',
      component: () => import('../views/CharacterView.vue'),
    },
    {
      path: '/character/:id/edit',
      name: 'character-edit',
      component: () => import('../views/CharacterEditView.vue'),
    },
    {
      path: '/character/:id/advancement',
      name: 'advancement',
      component: () => import('../views/AdvancementView.vue'),
    },
    {
      path: '/character/:id/spells',
      name: 'spells',
      component: () => import('../views/SpellsView.vue'),
    },
    {
      path: '/character/:id/techniques',
      name: 'techniques',
      component: () => import('../views/TechniquesView.vue'),
    },
    {
      path: '/rules',
      name: 'rules',
      component: () => import('../views/RulesView.vue'),
    },
    {
      path: '/character/:id/equipment',
      name: 'equipment',
      component: () => import('../views/EquipmentView.vue'),
    },
    {
      path: '/help/:topic?',
      name: 'help',
      component: () => import('../views/HelpView.vue'),
    },
  ],
})

export default router
