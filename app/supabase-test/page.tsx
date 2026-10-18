'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

type TestState = {
	status: 'checking' | 'success' | 'error'
	message: string
}

export default function SupabaseTestPage() {
	const [test, setTest] = useState<TestState>({
		status: 'checking',
		message: 'Проверяем подключение к Supabase...',
	})

	useEffect(() => {
		const runTest = async () => {
			try {
				const supabase = getSupabaseBrowserClient()
				const { error: sessionError } = await supabase.auth.getSession()

				if (sessionError) {
					throw sessionError
				}

				const { data, error } = await supabase
					.from('skills')
					.select('id')
					.limit(1)

				if (error) {
					throw error
				}

				setTest({
					status: 'success',
					message: `Supabase подключён. Запрос к таблице skills выполнен успешно. Получено строк: ${data.length}`,
				})
			} catch (error) {
				setTest({
					status: 'error',
					message:
						error instanceof Error
							? error.message
							: 'Неизвестная ошибка подключения',
				})
			}
		}

		void runTest()
	}, [])

	return (
		<main
			style={{
				minHeight: '100vh',
				display: 'grid',
				placeItems: 'center',
				padding: '40px',
				background: '#050713',
				color: '#ffffff',
				fontFamily: 'Arial, sans-serif',
			}}
		>
			<section
				style={{
					width: '100%',
					maxWidth: '700px',
					padding: '32px',
					border: '1px solid rgba(255,255,255,0.1)',
					borderRadius: '20px',
					background: 'rgba(255,255,255,0.04)',
				}}
			>
				<p
					style={{
						margin: '0 0 10px',
						fontSize: '13px',
						textTransform: 'uppercase',
						letterSpacing: '0.12em',
						opacity: 0.55,
					}}
				>
					LEADLY / Supabase
				</p>

				<h1
					style={{
						margin: '0 0 20px',
						fontSize: '32px',
					}}
				>
					Проверка подключения
				</h1>

				<p
					style={{
						margin: 0,
						fontSize: '17px',
						lineHeight: 1.6,
						color:
							test.status === 'error'
								? '#ff7b7b'
								: test.status === 'success'
									? '#7dffb2'
									: '#ffffff',
					}}
				>
					{test.message}
				</p>
			</section>
		</main>
	)
}
