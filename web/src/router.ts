import { createRouter, createWebHistory } from "vue-router";
import NewCaseView from "./views/NewCaseView.vue";
import CasesListView from "./views/CasesListView.vue";
import CaseDetailView from "./views/CaseDetailView.vue";
import AdminCasesListView from "./views/AdminCasesListView.vue";
import AdminCaseDetailView from "./views/AdminCaseDetailView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Doctor-facing.
    { path: "/", name: "new", component: NewCaseView },
    { path: "/cases", name: "cases", component: CasesListView },
    { path: "/cases/:id", name: "case", component: CaseDetailView, props: true },
    // Admin/research — not linked from the doctor nav, reachable by URL. Full record + exports.
    { path: "/admin/cases", name: "admin-cases", component: AdminCasesListView },
    { path: "/admin/cases/:id", name: "admin-case", component: AdminCaseDetailView, props: true },
  ],
});
