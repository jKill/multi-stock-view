/**
 * 侧边栏导航组件
 */

import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Grid3X3,
  TrendingUp,
} from 'lucide-react';
import { Logo } from '@/components/common';
import styles from './Sidebar.module.css';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/', label: '总览', icon: <LayoutDashboard size={18} /> },
  { path: '/heatmap', label: '热力图', icon: <Grid3X3 size={18} /> },
  { path: '/hot-stocks', label: '热门股', icon: <TrendingUp size={18} /> },
];

export function Sidebar() {
  const location = useLocation();

  const renderNavItem = (item: NavItem) => {
    const isActive =
      item.path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.path);

    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={`${styles.navItem} ${isActive ? styles.active : ''}`}
      >
        {isActive && (
          <motion.div
            className={styles.activeIndicator}
            layoutId="activeIndicator"
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        <span className={styles.icon}>{item.icon}</span>
        <span className={styles.label}>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <Logo size={36} />
        <span className={styles.logoText}>A股看板</span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navGroup}>
          {navItems.map(renderNavItem)}
        </div>
      </nav>
    </aside>
  );
}
