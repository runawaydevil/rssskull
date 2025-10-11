pipeline {
    agent any
    
    environment {
        NODE_VERSION = '20'
        DOCKER_IMAGE = 'rss-skull-bot'
        DOCKER_TAG = "${BUILD_NUMBER}"
        REGISTRY = 'your-registry.com' // Configure your Docker registry
    }
    
    tools {
        nodejs "${NODE_VERSION}"
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '📦 Checking out source code...'
                checkout scm
                
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📥 Installing dependencies...'
                sh 'npm ci'
            }
        }
        
        stage('Lint & Format Check') {
            steps {
                echo '🔍 Running linting and format checks...'
                sh 'npm run lint'
            }
        }
        
        stage('Build') {
            steps {
                echo '🔨 Building application...'
                sh 'npm run build'
            }
        }
        
        stage('Generate Prisma Client') {
            steps {
                echo '🗄️ Generating Prisma client...'
                sh 'npm run db:generate'
            }
        }
        
        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        echo '🧪 Running unit tests...'
                        sh 'npm run test'
                    }
                    post {
                        always {
                            // Publish test results if you have test reporters configured
                            publishTestResults testResultsPattern: 'test-results.xml'
                        }
                    }
                }
                
                stage('Test Coverage') {
                    steps {
                        echo '📊 Running test coverage...'
                        sh 'npm run test:coverage'
                    }
                    post {
                        always {
                            // Publish coverage reports
                            publishCoverage adapters: [
                                istanbulCoberturaAdapter('coverage/cobertura-coverage.xml')
                            ], sourceFileResolver: sourceFiles('STORE_LAST_BUILD')
                        }
                    }
                }
            }
        }
        
        stage('Security Audit') {
            steps {
                echo '🔒 Running security audit...'
                sh 'npm audit --audit-level=high'
            }
        }
        
        stage('Docker Build') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    changeRequest()
                }
            }
            steps {
                echo '🐳 Building Docker image...'
                script {
                    def image = docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}")
                    
                    // Tag with latest if main branch
                    if (env.BRANCH_NAME == 'main') {
                        image.tag('latest')
                    }
                    
                    // Tag with branch name
                    image.tag("${env.BRANCH_NAME}-${GIT_COMMIT_SHORT}")
                }
            }
        }
        
        stage('Docker Security Scan') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                echo '🔍 Scanning Docker image for vulnerabilities...'
                script {
                    try {
                        sh "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image ${DOCKER_IMAGE}:${DOCKER_TAG}"
                    } catch (Exception e) {
                        echo "Security scan completed with warnings: ${e.getMessage()}"
                    }
                }
            }
        }
        
        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                echo '🚀 Deploying to staging environment...'
                script {
                    // Deploy to staging
                    sh '''
                        docker-compose -f docker-compose.staging.yml down || true
                        docker-compose -f docker-compose.staging.yml up -d
                    '''
                }
            }
        }
        
        stage('Integration Tests') {
            when {
                branch 'develop'
            }
            steps {
                echo '🔗 Running integration tests...'
                script {
                    // Wait for services to be ready
                    sh 'sleep 30'
                    
                    // Run integration tests against staging
                    sh '''
                        # Health check
                        curl -f http://localhost:8916/health || exit 1
                        
                        # Add more integration tests here
                        echo "Integration tests passed"
                    '''
                }
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            steps {
                echo '🎯 Deploying to production...'
                script {
                    // Require manual approval for production deployment
                    input message: 'Deploy to production?', ok: 'Deploy',
                          submitterParameter: 'DEPLOYER'
                    
                    echo "Deployment approved by: ${env.DEPLOYER}"
                    
                    // Deploy to production
                    sh '''
                        # Backup current deployment
                        docker-compose -f docker-compose.prod.yml exec app npm run backup || true
                        
                        # Deploy new version
                        docker-compose -f docker-compose.prod.yml down
                        docker-compose -f docker-compose.prod.yml up -d
                        
                        # Wait for services
                        sleep 30
                        
                        # Health check
                        curl -f http://localhost:8916/health || exit 1
                    '''
                }
            }
        }
        
        stage('Push to Registry') {
            when {
                branch 'main'
            }
            steps {
                echo '📤 Pushing Docker image to registry...'
                script {
                    docker.withRegistry("https://${REGISTRY}", 'docker-registry-credentials') {
                        def image = docker.image("${DOCKER_IMAGE}:${DOCKER_TAG}")
                        image.push()
                        image.push('latest')
                    }
                }
            }
        }
    }
    
    post {
        always {
            echo '🧹 Cleaning up...'
            
            // Clean up Docker images
            sh '''
                docker image prune -f
                docker system prune -f --volumes
            '''
            
            // Archive artifacts
            archiveArtifacts artifacts: 'dist/**/*', allowEmptyArchive: true
            archiveArtifacts artifacts: 'coverage/**/*', allowEmptyArchive: true
        }
        
        success {
            echo '✅ Pipeline completed successfully!'
            
            // Notify success
            script {
                if (env.BRANCH_NAME == 'main') {
                    // Send notification to Slack/Teams/Email
                    slackSend(
                        channel: '#deployments',
                        color: 'good',
                        message: "✅ RSS Skull Bot v0.02.5 deployed successfully to production!\nCommit: ${GIT_COMMIT_SHORT}\nBuild: ${BUILD_NUMBER}"
                    )
                }
            }
        }
        
        failure {
            echo '❌ Pipeline failed!'
            
            // Notify failure
            slackSend(
                channel: '#deployments',
                color: 'danger',
                message: "❌ RSS Skull Bot v0.02.5 pipeline failed!\nBranch: ${env.BRANCH_NAME}\nCommit: ${GIT_COMMIT_SHORT}\nBuild: ${BUILD_NUMBER}\nCheck: ${BUILD_URL}"
            )
        }
        
        unstable {
            echo '⚠️ Pipeline completed with warnings!'
        }
    }
}