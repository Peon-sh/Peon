import * as lifecycle from './lifecycle';
import * as env from './env';
import * as volumes from './volumes';
import * as tasks from './tasks';
import * as webhooks from './webhooks';
import * as deployments from './deployments';
import * as previews from './previews';

export const ServiceModule = {
  listByProject: lifecycle.listByProject,
  get: lifecycle.get,
  projectIdFor: lifecycle.projectIdFor,
  create: lifecycle.create,
  createFromTemplate: lifecycle.createFromTemplate,
  update: lifecycle.update,
  getServiceConfig: lifecycle.getServiceConfig,
  updateServiceConfig: lifecycle.updateServiceConfig,
  remove: lifecycle.remove,
  setServer: lifecycle.setServer,

  listEnv: env.listEnv,
  upsertEnv: env.upsertEnv,
  bulkSaveEnv: env.bulkSaveEnv,
  importPreviewEnvFromProduction: env.importPreviewEnvFromProduction,
  deleteEnv: env.deleteEnv,

  listVolumes: volumes.listVolumes,
  createVolume: volumes.createVolume,
  deleteVolume: volumes.deleteVolume,

  listTasks: tasks.listTasks,
  createTask: tasks.createTask,
  updateTask: tasks.updateTask,
  deleteTask: tasks.deleteTask,
  runTask: tasks.runTask,
  listTaskExecutions: tasks.listTaskExecutions,

  listWebhooks: webhooks.listWebhooks,
  createWebhook: webhooks.createWebhook,
  deleteWebhook: webhooks.deleteWebhook,

  deploy: deployments.deploy,
  control: deployments.control,
  rollback: deployments.rollback,
  listDeployments: deployments.listDeployments,
  listActiveDeployments: deployments.listActiveDeployments,
  getDeployment: deployments.getDeployment,
  cancelDeployment: deployments.cancelDeployment,

  listPreviews: previews.listPreviews,
  deletePreview: previews.deletePreview,
};

export const ServiceService = ServiceModule;
