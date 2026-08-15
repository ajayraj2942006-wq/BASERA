import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			'/api': 'http://localhost:3001',
			'/meta-webhook': 'http://localhost:3001',
			'/whatsapp': 'http://localhost:3001'
		}
	}
})
