// 화자 분리 2차 실험용 선형대수 (docs/diarization-experiments.md E1·E3). 제품 코드가 아니라 실험 스크립트만 쓴다.

const QL_MAX_ITERATIONS = 500

/** Householder 삼중대각화 (Numerical Recipes tred2). a는 n×n 행 우선 배열이고 제자리에서 바뀐다 */
const tridiagonalize = ({
  a,
  n,
  withVectors
}: {
  a: Float64Array
  n: number
  withVectors: boolean
}) => {
  const d = new Float64Array(n)
  const e = new Float64Array(n)

  for (let i = n - 1; i > 0; i -= 1) {
    const l = i - 1
    const row = i * n
    let h = 0
    if (l > 0) {
      let scale = 0
      for (let k = 0; k <= l; k += 1) scale += Math.abs(a[row + k])
      if (scale === 0) {
        e[i] = a[row + l]
      } else {
        for (let k = 0; k <= l; k += 1) {
          a[row + k] /= scale
          h += a[row + k] * a[row + k]
        }
        let f = a[row + l]
        let g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h)
        e[i] = scale * g
        h -= f * g
        a[row + l] = f - g
        f = 0
        for (let j = 0; j <= l; j += 1) {
          if (withVectors) a[j * n + i] = a[row + j] / h
          g = 0
          for (let k = 0; k <= j; k += 1) g += a[j * n + k] * a[row + k]
          for (let k = j + 1; k <= l; k += 1) g += a[k * n + j] * a[row + k]
          e[j] = g / h
          f += e[j] * a[row + j]
        }
        const hh = f / (h + h)
        for (let j = 0; j <= l; j += 1) {
          f = a[row + j]
          g = e[j] - hh * f
          e[j] = g
          for (let k = 0; k <= j; k += 1) a[j * n + k] -= f * e[k] + g * a[row + k]
        }
      }
    } else {
      e[i] = a[row + l]
    }
    d[i] = h
  }

  if (withVectors) d[0] = 0
  e[0] = 0
  for (let i = 0; i < n; i += 1) {
    if (!withVectors) {
      d[i] = a[i * n + i]
      continue
    }
    if (d[i] !== 0) {
      for (let j = 0; j < i; j += 1) {
        let g = 0
        for (let k = 0; k < i; k += 1) g += a[i * n + k] * a[k * n + j]
        for (let k = 0; k < i; k += 1) a[k * n + j] -= g * a[k * n + i]
      }
    }
    d[i] = a[i * n + i]
    a[i * n + i] = 1
    for (let j = 0; j < i; j += 1) {
      a[j * n + i] = 0
      a[i * n + j] = 0
    }
  }

  return { d, e }
}

/** 삼중대각 행렬의 QL 반복 (Numerical Recipes tqli). z가 있으면 고유벡터(열)를 함께 돌린다 */
const diagonalize = ({
  d,
  e,
  n,
  z
}: {
  d: Float64Array
  e: Float64Array
  n: number
  z?: Float64Array
}) => {
  for (let i = 1; i < n; i += 1) e[i - 1] = e[i]
  e[n - 1] = 0

  for (let l = 0; l < n; l += 1) {
    let iterations = 0
    for (;;) {
      let m = l
      for (; m < n - 1; m += 1) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1])
        if (Math.abs(e[m]) <= Number.EPSILON * dd) break
      }
      if (m === l) break
      iterations += 1
      if (iterations > QL_MAX_ITERATIONS) throw new Error('고유값 반복이 수렴하지 않았습니다')

      let g = (d[l + 1] - d[l]) / (2 * e[l])
      let r = Math.hypot(g, 1)
      g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)))
      let s = 1
      let c = 1
      let p = 0
      let i = m - 1
      for (; i >= l; i -= 1) {
        let f = s * e[i]
        const b = c * e[i]
        r = Math.hypot(f, g)
        e[i + 1] = r
        if (r === 0) {
          d[i + 1] -= p
          e[m] = 0
          break
        }
        s = f / r
        c = g / r
        g = d[i + 1] - p
        r = (d[i] - g) * s + 2 * c * b
        p = s * r
        d[i + 1] = g + p
        g = c * r - b
        if (z) {
          for (let k = 0; k < n; k += 1) {
            f = z[k * n + i + 1]
            z[k * n + i + 1] = s * z[k * n + i] + c * f
            z[k * n + i] = c * z[k * n + i] - s * f
          }
        }
      }
      if (r === 0 && i >= l) continue
      d[l] -= p
      e[l] = g
      e[m] = 0
    }
  }
}

interface SymmetricEigenParams {
  /** n×n 대칭 행렬 (행 우선). 계산 중에 덮어쓴다 */
  matrix: Float64Array
  size: number
  withVectors?: boolean
}

/** 대칭 행렬의 고유값(오름차순)과, 요청하면 같은 순서의 고유벡터 */
export const symmetricEigen = ({ matrix, size, withVectors = false }: SymmetricEigenParams) => {
  const { d, e } = tridiagonalize({ a: matrix, n: size, withVectors })
  diagonalize({ d, e, n: size, z: withVectors ? matrix : undefined })

  const order = Array.from({ length: size }, (_, index) => index).sort((a, b) => d[a] - d[b])
  const values = order.map((index) => d[index])
  const vectors = withVectors
    ? order.map((column) =>
        Float64Array.from({ length: size }, (_, row) => matrix[row * size + column])
      )
    : []

  return { values, vectors }
}

export const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

/** L2 정규화된 벡터들의 코사인 유사도 행렬 (행 우선 n×n) */
export const cosineMatrix = (vectors: Float32Array[]) => {
  const n = vectors.length
  const matrix = new Float32Array(n * n)
  for (let i = 0; i < n; i += 1) {
    matrix[i * n + i] = 1
    for (let j = i + 1; j < n; j += 1) {
      const value = dot(vectors[i], vectors[j])
      matrix[i * n + j] = value
      matrix[j * n + i] = value
    }
  }
  return matrix
}
