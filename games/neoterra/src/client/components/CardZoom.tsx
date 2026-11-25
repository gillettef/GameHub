// 카드를 눌렀을 때 시트 위쪽에 크게 띄우는 확대 카드(효과 글자까지 보임)
import type { ComponentProps } from 'react';
import { CardFace } from './CardFace';
import { useCardSizes } from '../useCardSizes';
import styles from './CardZoom.module.css';

export function CardZoom(props: Omit<ComponentProps<typeof CardFace>, 'width' | 'onClick'>) {
  const { zoom } = useCardSizes();
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <CardFace {...props} width={zoom} />
      </div>
    </div>
  );
}
