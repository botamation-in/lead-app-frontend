import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initBrandAssets } from './utils/brandAssets'

initBrandAssets();

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
)
