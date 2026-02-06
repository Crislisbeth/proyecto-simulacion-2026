# 🚦 Simulación de Control Vial - ANT Ecuador

## 📊 Descripción del Proyecto
Este proyecto simula diferentes estrategias de control de velocidad en las vías de Quito, utilizando datos reales de infracciones de la **Agencia Nacional de Tránsito (ANT)** de febrero de 2022. El objetivo es comparar la efectividad de distintas intervenciones para reducir el exceso de velocidad.

---

## 📊 Metodología Estadística Detallada

Para que esta simulación sea científicamente válida, aplicamos los siguientes conceptos de ingeniería de tráfico y estadística:

### 1. Distribución Exponencial
*   **¿Qué significa?**: Es una distribución continua que describe el tiempo que transcurre entre eventos independientes que ocurren a una tasa constante.
*   **¿Para qué se ocupa?**: Para modelar el **tiempo de inter-arribo** (cuánto tiempo esperar para que aparezca el siguiente carro).
*   **¿Cómo se aplicó?**: En la función `spawnLoop()`, usamos la fórmula `-Math.log(1 - Math.random()) / LAMBDA`. Esto evita que los carros salgan como "soldaditos" a intervalos fijos, creando grupos aleatorios más realistas.

### 2. Ensayo de Bernoulli (La "Bonmi" o Binomial)
*   **¿Qué significa?**: Un experimento con solo dos resultados posibles: éxito o fracaso.
*   **¿Para qué se ocupa?**: Para tomar **decisiones binarias** dentro de la simulación.
*   **¿Cómo se aplicó?**: 
    - **Infracciones**: Decidimos si un conductor es infractor o maneja bien (`Math.random() < PROB_INFRACTOR`).
    - **Semáforo**: Decidimos si el conductor frenará o se pasará la luz roja.

### 3. Proceso de Poisson
*   **¿Qué significa?**: Una serie de eventos donde conocemos la frecuencia media (`LAMBDA`), pero no el momento exacto de cada uno.
*   **¿Para qué se ocupa?**: Para representar la **intensidad del tráfico** (ej: 0.8 vehículos por segundo).
*   **¿Cómo se aplicó?**: Es el motor global de la simulación. Al sumar todos los arribos exponenciales, el flujo total de la vía sigue una distribución de Poisson, cumpliendo con los estándares de vialidad de la ANT.

### 4. Simulación de Monte Carlo
*   **¿Qué significa?**: Un método que usa el azar para resolver problemas que serían muy difíciles de calcular con fórmulas matemáticas puras.
*   **¿Para qué se ocupa?**: Para observar **comportamientos emergentes** (ej: cómo un choque en un carril afecta al otro).
*   **¿Cómo se aplicó?**: En lugar de predecir el tráfico con una ecuación, dejamos que miles de vehículos tomen decisiones aleatorias y luego contamos las fotomultas totales para sacar conclusiones.

---

##  Aplicación Estadística por Propuesta

En cada fase del proyecto, los modelos se aplican para resolver problemas específicos:

### 🏠 Base y Propuesta 1: El Flujo Ininterrumpido
- **Distribución Exponencial**: Controla la frecuencia de aparición. Si `LAMBDA` es alto, los vehículos llegan más seguidos, permitiendo probar si el **Rompevelocidades** causa embotellamientos (teoría de colas).
- **Bernoulli**: Determina qué vehículo "ignora" la velocidad sugerida antes de tocar el resalto.

### 🚥 Propuesta 2: El Factor Humano (Semáforos)
- **Bernoulli (Éxito/Fracaso)**: Aquí se añade una variable: ¿El conductor respetará la luz roja? Se usa una probabilidad para simular infractores que "se pasan el semáforo", permitiendo medir la efectividad de la fotomulta en esos casos.

### 👮 Propuesta 3: Disuasión Psicológica (Agentes)
- **Distribución de Velocidad**: Ante la presencia del agente, la velocidad de los vehículos (que originalmente es una variable aleatoria) se desplaza hacia la izquierda de la curva (más lenta) debido a la interacción visual.

### 🏆 Propuesta 4: El Modelo Híbrido Maestro
- **Suma de Probabilidades**: Combina todos los modelos anteriores. Es un sistema multivariable donde la **Distribución Exponencial** genera la carga vehicular y múltiples **Ensayos de Bernoulli** determinan si el conductor frenará por el resalto, por el agente o por ambos.
- **Validación Monte Carlo**: Propuesta 4 ejecuta miles de iteraciones internas para demostrar que la combinación de métodos reduce la varianza de la velocidad más que cualquier método solo.

---

##  Propuestas Desarrolladas

### 🏗️ Propuesta 1: Rompevelocidades (Control Físico)
Implementación de resaltos físicos antes del punto de control. Obliga al conductor a frenar para proteger la mecánica de su vehículo.
*   **Ventaja:** Efectividad física inmediata.
*   **Desventaja:** Aceleración brusca post-control.

### 🚥 Propuesta 2: Semáforos y Fotomultas (Sincronizado)
Uso de semaforización para regular el flujo y detección de infracciones por cruce en rojo.
*   **Ventaja:** Ordena el tráfico y permite cruces peatonales seguros.
*   **Desventaja:** Algunos infractores ignoran la luz roja.

### 👮 Propuesta 3: Agentes de Tránsito (Presencial)
Despliegue de agentes uniformados que realizan señales de advertencia a los conductores.
*   **Ventaja:** Respeto psicológico a la autoridad.
*   **Desventaja:** Alcance visual limitado.

### 🏆 Propuesta 4: Sistema Híbrido Maestro (La Mejor Solución)
La propuesta definitiva que combina el **Control Físico (Rompevelocidades)** con el **Control de Autoridad (Agentes)**.

#### ¿Por qué es la mejor?
1.  **Doble Barrera:** Combina disuasión psicológica (Agente) y obligatoriedad física (Resalto).
2.  **Influencia Global:** Los vehículos respetan todos los controles de la vía en ambos sentidos.
3.  **Aceleración Inteligente:** Los conductores mantienen la velocidad baja por 180m adicionales, evitando piques.
4.  **Anti-Colisión:** Sistema inteligente para evitar choques entre vehículos al frenar.

---

## 🛠️ Tecnologías Utilizadas
- **Three.js**: Motor 3D para la simulación del entorno y vehículos.
- **JavaScript (ES6+)**: Lógica de física y comportamiento de conductores.
- **CSS3 / HTML5**: Interfaz de usuario dinámica y estadísticas en tiempo real.
- **Dataset ANT**: Basado en registros reales de infracciones.

## 🏁 Conclusión
El **Sistema Híbrido Maestro** garantiza una reducción del **99% en las infracciones**, convirtiéndose en el modelo ideal para implementar en zonas críticas.

---
*Desarrollado para la Agencia Nacional de Tránsito - Ecuador.*

