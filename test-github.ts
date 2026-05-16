import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

// Cargar las variables del archivo .env
dotenv.config();

const githubToken = process.env.GITHUB_TOKEN;

if (!githubToken) {
  console.error('❌ Error: GITHUB_TOKEN no está definido en el archivo .env');
  process.exit(1);
}

// Inicializar la conexión usando tu token maestro
const octokit = new Octokit({
  auth: githubToken
});

// Datos de tu repositorio de prueba
const OWNER = 'JorgeFloresM';
const REPO = 'test-api-devpanel';

async function testGitHubAPI() {
  try {
    console.log(`Conectando al repositorio: ${OWNER}/${REPO}...`);

    // 1. Consultar si el repositorio existe y tenemos acceso
    const { data: repoData } = await octokit.rest.repos.get({
      owner: OWNER,
      repo: REPO,
    });
    console.log(`✅ Repositorio conectado con éxito: ${repoData.full_name}`);

    // 2. Crear un Issue de prueba en el repositorio
    console.log('Creando un issue de prueba...');
    const { data: issueData } = await octokit.rest.issues.create({
      owner: OWNER,
      repo: REPO,
      title: 'Issue generado desde DevPanel API 🚀',
      body: 'Este es un issue de prueba creado automáticamente usando Octokit y TypeScript para el proyecto escolar.',
    });
    
    console.log(`✅ Issue creado exitosamente. Puedes verlo aquí: ${issueData.html_url}`);

  } catch (error) {
    console.error('❌ Error al interactuar con la API de GitHub:', error);
  }
}

// Ejecutar la función
testGitHubAPI();